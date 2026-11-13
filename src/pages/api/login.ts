import type {APIRoute} from 'astro';
import {SESSION_COOKIE, checkPassword, passwordRequired, sessionToken} from '../../lib/auth';
import {fail, json} from '../../lib/http';

export const POST: APIRoute = async ({request, cookies, url}) => {
  if (!passwordRequired()) return json({ok: true});
  const b = await request.json().catch(() => ({}));
  if (typeof b.password !== 'string' || !checkPassword(b.password)) {
    await new Promise(r => setTimeout(r, 800)); // slows down guessing
    return fail('Contraseña incorrecta.', 401);
  }
  cookies.set(SESSION_COOKIE, sessionToken(), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: url.protocol === 'https:',
    maxAge: 60 * 60 * 24 * 30,
  });
  return json({ok: true});
};

export const DELETE: APIRoute = ({cookies}) => {
  cookies.delete(SESSION_COOKIE, {path: '/'});
  return json({ok: true});
};
