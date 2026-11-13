import type {APIRoute} from 'astro';
import {webhookKey} from '../../lib/apify';
import {tick} from '../../lib/jobs';

/** Apify calls this when one of our runs ends, so searches keep moving with no tab open. */
export const POST: APIRoute = async ({url}) => {
  if (url.searchParams.get('key') !== webhookKey()) return new Response(null, {status: 404});
  // tick() reads run state from Apify itself; the payload is not trusted. A 503 makes Apify retry
  // later, which carries on with a very large import that didn't fit in one call.
  return new Response(null, {status: (await tick()) ? 503 : 204});
};
