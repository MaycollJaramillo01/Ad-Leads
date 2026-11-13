import type {APIRoute} from 'astro';
import {getSearch} from '../../../../lib/db';
import {fail, json} from '../../../../lib/http';
import {cancel} from '../../../../lib/jobs';

export const POST: APIRoute = async ({params}) => {
  const id = Number(params.id);
  if (!getSearch(id)) return fail('Búsqueda no encontrada', 404);
  await cancel(id);
  return json({search: getSearch(id)});
};
