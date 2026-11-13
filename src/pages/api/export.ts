import type {APIRoute} from 'astro';
import {advertisersCsv} from '../../lib/csv';
import {allAdvertisers} from '../../lib/db';
import {parseFilter} from '../../lib/http';

/** Same filters as /api/advertisers, every matching row, as a CSV download. */
export const GET: APIRoute = async ({url}) => {
  const rows = await allAdvertisers(parseFilter(url.searchParams));
  const name = (url.searchParams.get('filename') ?? 'anunciantes').replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 60) || 'anunciantes';
  return new Response(advertisersCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
};
