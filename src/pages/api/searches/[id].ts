import type {APIRoute} from 'astro';
import {RUNNING, deleteSearch, getSearch, listRunningSearches} from '../../../lib/db';
import {fail, json} from '../../../lib/http';
import {kick} from '../../../lib/jobs';

export const GET: APIRoute = async ({params}) => {
  kick();
  const search = await getSearch(Number(params.id));
  if (!search) return fail('Búsqueda no encontrada', 404);
  const queue = (await listRunningSearches()).map(s => s.id);
  return json({search, queuePosition: queue.indexOf(search.id)});
};

export const DELETE: APIRoute = async ({params}) => {
  const search = await getSearch(Number(params.id));
  if (!search) return fail('Búsqueda no encontrada', 404);
  if (RUNNING.includes(search.status)) return fail('Cancela la búsqueda antes de borrarla.', 409);
  await deleteSearch(search.id);
  return json({ok: true});
};
