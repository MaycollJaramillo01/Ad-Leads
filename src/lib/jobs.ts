// One background worker: searches run one at a time in creation order, survive a
// server restart (Apify run IDs are stored, so polling resumes) and can be cancelled.
import {ADS_ACTOR, PAGES_ACTOR, abortRun, runItems, startRun, waitRun} from './apify.ts';
import {
  RUNNING, applyContact, getSearch, ingestAds, listRunningSearches, markEnriched, pagesToEnrich, updateSearch,
} from './db.ts';
import {adsActorInput, contactKeys, mapAd, mapContact, normUrl} from './scrape.ts';

interface Worker {
  current: number | null;
  cancelRequested: boolean;
}
// Kept on globalThis so dev-server reloads don't start a second worker.
const w: Worker = ((globalThis as any).__adsWorker ??= {current: null, cancelRequested: false});

const done = () => new Date().toISOString();

export function pump() {
  if (w.current != null) return;
  const next = listRunningSearches()[0];
  if (!next) return;
  w.current = next.id;
  w.cancelRequested = false;
  runSearch(next.id)
    .catch(e => updateSearch(next.id, {status: 'error', error: (e as Error).message, finished_at: done()}))
    .finally(() => {
      w.current = null;
      pump();
    });
}

export async function cancel(id: number) {
  const s = getSearch(id);
  if (!s || !RUNNING.includes(s.status)) return;
  if (w.current === id) {
    w.cancelRequested = true; // the worker aborts the Apify run and keeps what was scraped
    return;
  }
  for (const runId of [s.ads_run_id, s.pages_run_id]) if (runId) await abortRun(runId);
  updateSearch(id, {status: 'cancelled', finished_at: done()});
}

async function runSearch(id: number) {
  let s = getSearch(id)!;
  const stop = () => w.cancelRequested;

  // ---- Step 1: ads ----
  if (s.status === 'queued' || s.status === 'ads') {
    let runId = s.ads_run_id;
    if (!runId) {
      const run = await startRun(ADS_ACTOR, adsActorInput(s));
      runId = run.id;
    }
    updateSearch(id, {status: 'ads', ads_run_id: runId, progress: 0});
    const run = await waitRun(runId, n => updateSearch(id, {progress: n}), stop);
    if (run.status !== 'SUCCEEDED' && run.status !== 'ABORTED') {
      throw new Error(`La búsqueda de anuncios terminó con estado ${run.status}${run.statusMessage ? `: ${run.statusMessage}` : ''}`);
    }
    const ads = (await runItems(run)).map(mapAd).filter(a => a != null);
    const advertisers = ingestAds(id, ads);
    const cancelled = stop() || run.status === 'ABORTED';
    updateSearch(id, {
      ads_count: ads.length,
      advertisers_count: advertisers,
      cost_usd: run.usageTotalUsd ?? 0,
      status: cancelled ? 'cancelled' : s.enrich && advertisers > 0 ? 'pages' : 'done',
      progress: 0,
      ...(cancelled || !s.enrich || advertisers === 0 ? {finished_at: done()} : {}),
    });
    s = getSearch(id)!;
  }

  // ---- Step 2: contact details per advertiser page ----
  if (s.status !== 'pages') return;
  let runId = s.pages_run_id;
  const todo = pagesToEnrich(id);
  if (!runId) {
    if (todo.length === 0) {
      updateSearch(id, {status: 'done', cached_count: s.advertisers_count, finished_at: done()});
      return;
    }
    const run = await startRun(PAGES_ACTOR, {startUrls: todo.map(t => ({url: t.page_url}))});
    runId = run.id;
    updateSearch(id, {pages_run_id: runId, progress: 0, progress_total: todo.length, cached_count: s.advertisers_count - todo.length});
  }
  const run = await waitRun(runId, n => updateSearch(id, {progress: n}), stop);
  const items = run.status === 'SUCCEEDED' || run.status === 'ABORTED' ? await runItems(run) : [];
  const byKey = new Map<string, any>();
  for (const p of items) for (const k of contactKeys(p)) byKey.set(k, p);

  let enriched = 0;
  for (const t of todo) {
    const p = byKey.get(normUrl(t.page_url)) ?? byKey.get(t.page_id);
    if (p) {
      applyContact(t.page_id, mapContact(p));
      enriched++;
    }
  }
  if (run.status === 'SUCCEEDED') markEnriched(todo.map(t => t.page_id));

  const cancelled = stop() || run.status === 'ABORTED';
  updateSearch(id, {
    enriched_count: enriched,
    cost_usd: s.cost_usd + (run.usageTotalUsd ?? 0),
    status: cancelled ? 'cancelled' : run.status === 'SUCCEEDED' ? 'done' : 'error',
    error: run.status === 'SUCCEEDED' || cancelled ? null : `La extracción de contactos terminó con estado ${run.status}. Los anunciantes se guardaron sin contactos.`,
    finished_at: done(),
  });
}
