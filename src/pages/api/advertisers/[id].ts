import type {APIRoute} from 'astro';
import {getAdvertiser, updateAdvertiser} from '../../../lib/db';
import {fail, json} from '../../../lib/http';

export const GET: APIRoute = ({params}) => {
  const adv = getAdvertiser(String(params.id));
  return adv ? json(adv) : fail('Anunciante no encontrado', 404);
};

export const PATCH: APIRoute = async ({params, request}) => {
  const id = String(params.id);
  if (!getAdvertiser(id)) return fail('Anunciante no encontrado', 404);
  const b = await request.json().catch(() => ({}));
  try {
    updateAdvertiser(id, {
      status: typeof b.status === 'string' ? b.status : undefined,
      notes: typeof b.notes === 'string' ? b.notes : undefined,
    });
  } catch (e) {
    return fail((e as Error).message);
  }
  return json(getAdvertiser(id));
};
