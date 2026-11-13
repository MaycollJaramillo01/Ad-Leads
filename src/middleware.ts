import {defineMiddleware} from 'astro:middleware';
import {SESSION_COOKIE, isSignedIn, passwordRequired} from './lib/auth';

// Reachable without a session: the login itself, and Apify's callback (it carries its own key).
const OPEN = new Set(['/login', '/api/login', '/api/apify-webhook']);

export const onRequest = defineMiddleware((ctx, next) => {
  if (!passwordRequired() || OPEN.has(ctx.url.pathname) || isSignedIn(ctx.cookies.get(SESSION_COOKIE)?.value)) return next();
  if (ctx.url.pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({error: 'Inicia sesión para continuar.'}), {status: 401, headers: {'Content-Type': 'application/json'}});
  }
  return ctx.redirect(`/login?next=${encodeURIComponent(ctx.url.pathname + ctx.url.search)}`);
});
