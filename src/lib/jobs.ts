// Searches advance in short, idempotent steps whose state lives in the database. Anything may
// call tick(): the UI while it polls, Apify's webhook when a run ends, and a timer on a local
// server. So it works the same on a long-running Node process and on Vercel, where a function
// stops after each response. Searches still run one at a time, oldest first.
import {waitUntil} from '@vercel/functions';
import {TERMINAL, TransientError, abortRun, datasetCount, datasetItems, getRun, startRun, webhookKey} from './apify.ts';
import {
  RUNNING, getSearch, ingestAds, lease, listRunningSearches, pagesToEnrich, release, saveContacts, searchCounts,
  searchesToReconcile, updateSearch, type ScrapedAd, type SearchPatch, type SearchRow,
} from './db.ts';
import {
  ADS_ACTOR, PAGES_ACTOR, adsActorInput, contactKeys, libraryUrls, mapAd, mapContact, normUrl, pagesActorInput,
} from './scrape.ts';

const BUDGET_MS = 20_000; // per tick: Apify waits ~30 s for a webhook reply
const LEASE_S = 60;
const PAGE = 1000;
const now = () => new Date().toISOString();

/** Where Apify should report finished runs: the production URL on Vercel, APP_URL if set, else nowhere. */
function webhookUrl(): string | null {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const base = process.env.APP_URL ?? (vercel ? `https://${vercel}` : '');
  return base ? `${base.replace(/\/+$/, '')}/api/apify-webhook?key=${webhookKey()}` : null;
}

type Step = 'again' | 'wait';

/** Advance the queue as far as it can go right now. Returns true if work is left for a later call. */
export async function tick(): Promise<boolean> {
  const t0 = Date.now();
  for (;;) {
    const running = await listRunningSearches();
    // A cancelled search still waiting in line closes at once; otherwise work on the oldest.
    const s = running.find(r => r.cancel_requested && r.status === 'queued') ?? running[0];
    if (!s || !(await lease(s.id, LEASE_S))) break; // nothing to do, or another request is on it
    let step: Step = 'wait';
    try {
      step = await advance(s, t0);
    } catch (e) {
      if (e instanceof TransientError) console.warn(`search ${s.id}: ${e.message} (retrying later)`);
      else {
        await updateSearch(s.id, {status: 'error', error: (e as Error).message, finished_at: now()});
        step = 'again'; // move on to the next search in line
      }
    } finally {
      await release(s.id);
    }
    if (step === 'wait') break;
    if (Date.now() - t0 > BUDGET_MS) return true;
  }
  await reconcileCosts().catch(e => console.warn('cost reconcile:', (e as Error).message));
  return false;
}

/** Run a tick without making the caller wait; on Vercel, waitUntil keeps the function alive for it. */
export function kick() {
  waitUntil(tick().catch(e => console.error('tick failed:', e)));
}

/** Flag it; the next tick aborts the Apify run, keeps what was scraped and closes the search. */
export async function cancel(id: number) {
  const s = await getSearch(id);
  if (!s || !RUNNING.includes(s.status)) return;
  await updateSearch(id, {cancel_requested: true});
  kick();
}

async function advance(s: SearchRow, t0: number): Promise<Step> {
  // ---- Step 1: ads, one Apify run per country (see adsActorInput), one after another ----
  const urls = libraryUrls(s);
  const adsRuns = s.ads_runs.split(' ').filter(Boolean);
  const startNextAdsRun = async (patch: SearchPatch) => {
    const run = await startRun(ADS_ACTOR, adsActorInput(s, urls[adsRuns.length]), webhookUrl());
    await updateSearch(s.id, {...patch, status: 'ads', ads_runs: [...adsRuns, run.id].join(' '), ingest_offset: 0});
  };

  if (s.status === 'queued') {
    if (s.cancel_requested) {
      await updateSearch(s.id, {status: 'cancelled', finished_at: now(), cost_final: true});
      return 'again';
    }
    await startNextAdsRun({progress: 0});
    return 'wait';
  }

  if (s.status === 'ads') {
    const run = await getRun(adsRuns.at(-1)!);
    if (!TERMINAL.has(run.status)) {
      if (s.cancel_requested) await abortRun(run.id);
      await updateSearch(s.id, {progress: s.ads_count + (await datasetCount(run.defaultDatasetId))});
      return 'wait';
    }
    // Save the dataset a page at a time; ingest_offset lets a later tick pick up where this one stopped.
    let offset = s.ingest_offset;
    let itemError = '';
    for (;;) {
      if (Date.now() - t0 > BUDGET_MS) return 'again';
      const items = await datasetItems(run.defaultDatasetId, offset, PAGE);
      offset += items.length;
      itemError ||= items.find(i => typeof i?.error === 'string')?.error ?? '';
      if (items.length) await ingestAds(s.id, items.map(mapAd).filter((a): a is ScrapedAd => a != null), offset);
      if (items.length < PAGE) break;
    }
    const {ads, advertisers} = await searchCounts(s.id);
    const counts = {
      ads_count: ads,
      advertisers_count: advertisers,
      cost_usd: s.cost_usd + (run.usageTotalUsd ?? 0), // provisional: reconcileCosts() re-reads it once Apify closes the bill
    };
    if (run.status === 'SUCCEEDED' && !s.cancel_requested && adsRuns.length < urls.length) {
      await startNextAdsRun({...counts, progress: ads}); // next country
      return 'wait';
    }
    // The actor reports bad input as a SUCCEEDED run whose only items are {error: "..."}.
    const actorError = ads === 0 && offset > 0 ? itemError || run.statusMessage || 'no devolvió anuncios' : null;
    const next =
      s.cancel_requested || run.status === 'ABORTED' ? 'cancelled'
      : run.status !== 'SUCCEEDED' || actorError ? 'error'
      : s.enrich && advertisers > 0 ? 'pages'
      : 'done';
    await updateSearch(s.id, {
      ...counts,
      progress: 0,
      status: next,
      ...(next === 'error'
        ? {
            error: actorError
              ? `Apify rechazó la búsqueda: ${actorError}`
              : `La búsqueda de anuncios terminó con estado ${run.status}${run.statusMessage ? `: ${run.statusMessage}` : ''}. Se guardó lo que alcanzó a extraer.`,
          }
        : {}),
      ...(next === 'pages' ? {} : {finished_at: now()}),
    });
    return 'again';
  }

  // ---- Step 2: contact details per advertiser page ----
  if (s.status === 'pages') {
    if (!s.pages_run_id) {
      if (s.cancel_requested) {
        await updateSearch(s.id, {status: 'cancelled', finished_at: now()});
        return 'again';
      }
      const todo = await pagesToEnrich(s.id);
      if (todo.length === 0) {
        await updateSearch(s.id, {status: 'done', cached_count: s.advertisers_count, finished_at: now()});
        return 'again';
      }
      const run = await startRun(PAGES_ACTOR, pagesActorInput(todo), webhookUrl());
      await updateSearch(s.id, {pages_run_id: run.id, progress: 0, progress_total: todo.length, cached_count: s.advertisers_count - todo.length});
      return 'wait';
    }
    const run = await getRun(s.pages_run_id);
    if (!TERMINAL.has(run.status)) {
      if (s.cancel_requested) await abortRun(run.id);
      await updateSearch(s.id, {progress: await datasetCount(run.defaultDatasetId)});
      return 'wait';
    }
    const items: any[] = []; // one item per page tried: a few thousand at most
    for (;;) {
      const page = await datasetItems(run.defaultDatasetId, items.length, PAGE);
      items.push(...page);
      if (page.length < PAGE) break;
    }
    const byKey = new Map<string, any>();
    for (const p of items) for (const k of contactKeys(p)) byKey.set(k, p);
    const todo = await pagesToEnrich(s.id);
    const found = todo.flatMap(t => {
      const p = byKey.get(t.page_id) ?? byKey.get(normUrl(t.page_url));
      return p ? [{pageId: t.page_id, contact: mapContact(p)}] : [];
    });
    const ok = run.status === 'SUCCEEDED';
    const cancelled = s.cancel_requested || run.status === 'ABORTED';
    // Pages count as tried only on a clean run, so a failed one doesn't block a retry for 30 days.
    await saveContacts(s.id, found, ok ? todo.map(t => t.page_id) : [], {
      enriched_count: found.length,
      cost_usd: s.cost_usd + (run.usageTotalUsd ?? 0),
      status: cancelled ? 'cancelled' : ok ? 'done' : 'error',
      error: ok || cancelled ? null : `La extracción de contactos terminó con estado ${run.status}. Los anunciantes se guardaron sin contactos.`,
      finished_at: now(),
    });
    return 'again';
  }
  return 'wait';
}

/** Apify books a run's last charges ~30 s after it ends, so read each finished search's runs once more. */
async function reconcileCosts() {
  for (const s of await searchesToReconcile()) {
    let cost = 0;
    for (const id of [...s.ads_runs.split(' '), s.pages_run_id]) if (id) cost += (await getRun(id)).usageTotalUsd ?? 0;
    await updateSearch(s.id, {cost_usd: Math.round(cost * 1e5) / 1e5, cost_final: true});
  }
}

// A long-running local server also advances on a timer, so searches finish with no tab open.
// Vercel has no timer; there Apify's webhook (see webhookUrl) plays that role.
// Replaced on every module reload, so `astro dev` never keeps ticking with stale code.
if (!process.env.VERCEL) {
  clearInterval((globalThis as any).__adsTicker);
  (globalThis as any).__adsTicker = setInterval(() => kick(), 5000).unref();
}
