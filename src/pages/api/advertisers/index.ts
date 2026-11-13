import type {APIRoute} from 'astro';
import {bulkStatus, listAdvertisers} from '../../../lib/db';
import {fail, json, parseFilter} from '../../../lib/http';

export const GET: APIRoute = ({url}) => json(listAdvertisers(parseFilter(url.searchParams)));

/** Bulk status change: {ids: string[], status}. */
export const PATCH: APIRoute = async ({request}) => {
  const b = await request.json().catch(() => ({}));
  const ids = (Array.isArray(b.ids) ? b.ids : []).filter((i: unknown) => typeof i === 'string').slice(0, 5000);
  if (ids.length === 0) return fail('No hay anunciantes seleccionados.');
  try {
    bulkStatus(ids, String(b.status));
  } catch (e) {
    return fail((e as Error).message);
  }
  return json({ok: true, updated: ids.length});
};
