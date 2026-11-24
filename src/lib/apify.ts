// Server-only: the token never reaches the browser.
import {createHash} from 'node:crypto';

const API = 'https://api.apify.com/v2';
export const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT']);

export interface Run {
  id: string;
  status: string;
  defaultDatasetId: string;
  usageTotalUsd?: number;
  statusMessage?: string;
}

function token(): string {
  const t = process.env.APIFY_TOKEN;
  if (!t) throw new Error('Falta APIFY_TOKEN en las variables de entorno');
  return t;
}

/** Secret part of our webhook URL, derived from the token so there is no extra setting. */
export const webhookKey = () => createHash('sha256').update(`adleads-webhook:${token()}`).digest('hex').slice(0, 32);

/** Network hiccups and Apify 5xx/429: worth retrying on the next tick, not failing a paid search. */
export class TransientError extends Error {}

async function call(path: string, init?: RequestInit) {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: {Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json'},
    });
  } catch (e) {
    throw new TransientError(`No se pudo contactar con Apify: ${(e as Error).message}`);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = body?.error?.message ?? `Apify respondió ${res.status}`;
    throw res.status === 429 || res.status >= 500 ? new TransientError(message) : new Error(message);
  }
  return body;
}

export interface RunLimits {
  /** Pay-per-result cap ("Maximum charged results"). */
  maxItems?: number;
  /**
   * Pay-per-event cap ("Maximum cost per run"). Without it Apify applies the account's default
   * cap, which can stop a run with SUCCEEDED long before it reaches the requested number of ads.
   */
  maxTotalChargeUsd?: number;
  /** Run memory in MB; omitted = the actor's default. */
  memoryMbytes?: number;
}

/** Start an actor run. With `webhookUrl`, Apify calls it once the run ends (any outcome). */
export async function startRun(actor: string, input: unknown, webhookUrl?: string | null, limits: RunLimits = {}): Promise<Run> {
  const q = new URLSearchParams();
  if (webhookUrl) {
    q.set(
      'webhooks',
      btoa(JSON.stringify([{eventTypes: ['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED', 'ACTOR.RUN.ABORTED', 'ACTOR.RUN.TIMED_OUT'], requestUrl: webhookUrl}])),
    );
  }
  if (limits.maxItems) q.set('maxItems', String(Math.ceil(limits.maxItems)));
  if (limits.maxTotalChargeUsd) q.set('maxTotalChargeUsd', limits.maxTotalChargeUsd.toFixed(2));
  if (limits.memoryMbytes) q.set('memory', String(limits.memoryMbytes));
  const qs = q.toString();
  return (await call(`/acts/${actor}/runs${qs ? `?${qs}` : ''}`, {method: 'POST', body: JSON.stringify(input)})).data;
}

export const getRun = async (runId: string): Promise<Run> => (await call(`/actor-runs/${runId}`)).data;

export async function abortRun(runId: string) {
  await call(`/actor-runs/${runId}/abort`, {method: 'POST'}).catch(() => {});
}

export async function datasetCount(datasetId: string): Promise<number> {
  return (await call(`/datasets/${datasetId}`)).data?.itemCount ?? 0;
}

export const datasetItems = <T = any>(datasetId: string, offset: number, limit = 1000): Promise<T[]> =>
  call(`/datasets/${datasetId}/items?clean=true&format=json&offset=${offset}&limit=${limit}`);
