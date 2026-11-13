// Server-only: the token never reaches the browser.
const API = 'https://api.apify.com/v2';
const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT']);

export const ADS_ACTOR = 'apify~facebook-ads-scraper';
export const PAGES_ACTOR = 'apify~facebook-pages-scraper';

export interface Run {
  id: string;
  status: string;
  defaultDatasetId: string;
  usageTotalUsd?: number;
  statusMessage?: string;
}

function token(): string {
  const t = process.env.APIFY_TOKEN ?? import.meta.env?.APIFY_TOKEN;
  if (!t) throw new Error('Falta APIFY_TOKEN en el archivo .env');
  return t;
}

async function call(path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json'},
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message ?? `Apify respondió ${res.status}`);
  return body;
}

export async function startRun(actor: string, input: unknown): Promise<Run> {
  return (await call(`/acts/${actor}/runs`, {method: 'POST', body: JSON.stringify(input)})).data;
}

export async function abortRun(runId: string) {
  await call(`/actor-runs/${runId}/abort`, {method: 'POST'}).catch(() => {});
}

export async function datasetCount(datasetId: string): Promise<number> {
  return (await call(`/datasets/${datasetId}`)).data?.itemCount ?? 0;
}

/** Poll until the run ends, reporting dataset size along the way. */
export async function waitRun(runId: string, onProgress?: (items: number) => void, shouldStop?: () => boolean): Promise<Run> {
  let run: Run = (await call(`/actor-runs/${runId}`)).data;
  while (!TERMINAL.has(run.status)) {
    if (shouldStop?.()) {
      await abortRun(runId);
    }
    run = (await call(`/actor-runs/${runId}?waitForFinish=10`)).data;
    if (onProgress) onProgress(await datasetCount(run.defaultDatasetId).catch(() => 0));
  }
  return run;
}

export async function runItems<T = any>(run: Run): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page: T[] = await call(`/datasets/${run.defaultDatasetId}/items?clean=true&format=json&offset=${offset}&limit=1000`);
    out.push(...page);
    if (page.length < 1000) return out;
  }
}
