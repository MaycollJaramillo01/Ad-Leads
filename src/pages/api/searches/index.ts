import type {APIRoute} from 'astro';
import {createSearch, listSearches} from '../../../lib/db';
import {fail, json} from '../../../lib/http';
import {pump} from '../../../lib/jobs';
import {isFacebookUrl} from '../../../lib/scrape';

export const GET: APIRoute = ({url}) => {
  pump();
  return json({searches: listSearches(Number(url.searchParams.get('limit')) || 100)});
};

const ACTIVE = ['active', 'inactive', 'all'];
const MEDIA = ['all', 'image', 'video', 'meme', 'none'];

export const POST: APIRoute = async ({request}) => {
  const b = await request.json().catch(() => ({}));
  const query = String(b.query ?? '').trim().slice(0, 500);
  if (!query) return fail('Escribe una palabra clave o pega una URL de Facebook.');

  const isUrl = isFacebookUrl(query);
  const countries: string[] = isUrl
    ? ['ALL']
    : [...new Set<string>((Array.isArray(b.countries) ? b.countries : []).filter((c: unknown) => typeof c === 'string' && /^([A-Z]{2}|ALL)$/.test(c)))];
  if (countries.length === 0) return fail('Elige al menos un país.');
  if (countries.length > 40) return fail('Máximo 40 países por búsqueda.');
  if (countries.includes('ALL') && countries.length > 1) return fail('"Todos los países" no se combina con países concretos.');

  const newer = typeof b.newerThan === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.newerThan) ? b.newerThan : null;
  const search = createSearch({
    query,
    countries,
    active_status: ACTIVE.includes(b.activeStatus) ? b.activeStatus : 'active',
    media_type: MEDIA.includes(b.mediaType) ? b.mediaType : 'all',
    newer_than: newer,
    results_limit: Math.min(Math.max(Math.round(Number(b.limit)) || 50, 1), 2000),
    enrich: b.enrich !== false,
    exact: b.exact === true,
  });
  pump();
  return json({search}, 201);
};
