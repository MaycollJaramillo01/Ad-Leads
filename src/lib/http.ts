import type {AdvertiserFilter} from './db.ts';

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {status, headers: {'Content-Type': 'application/json'}});

export const fail = (message: string, status = 400) => json({error: message}, status);

const COUNTRY = /^[A-Z]{2}$/;

/** Query string → advertiser filter, shared by the list and the CSV export. */
export function parseFilter(p: URLSearchParams): AdvertiserFilter {
  const contact = p.get('contact');
  return {
    q: p.get('q')?.trim().slice(0, 200) || undefined,
    status: p.get('status') || undefined,
    countries: (p.get('countries') ?? '').split(',').filter(c => COUNTRY.test(c)),
    contact: contact === 'email' || contact === 'phone' || contact === 'any' || contact === 'none' ? contact : undefined,
    searchId: Number(p.get('search')) || undefined,
    ids: (p.get('ids') ?? '').split(',').filter(id => /^\d{1,30}$/.test(id)).slice(0, 1000),
    sort: p.get('sort') || undefined,
    dir: p.get('dir') === 'asc' ? 'asc' : 'desc',
    page: Number(p.get('page')) || 1,
    pageSize: Number(p.get('pageSize')) || 50,
  };
}
