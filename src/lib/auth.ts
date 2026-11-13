// One shared password, set as APP_PASSWORD. Unset (local use) means no login screen; on a public
// URL it must be set, or anyone could spend the Apify credit and read the leads.
import {createHash, createHmac, timingSafeEqual} from 'node:crypto';

export const SESSION_COOKIE = 'adleads_session';

export const passwordRequired = () => Boolean(process.env.APP_PASSWORD);

/** Cookie value: an HMAC of the password, so changing APP_PASSWORD signs every session out. */
export const sessionToken = () => createHmac('sha256', process.env.APP_PASSWORD ?? '').update('adleads-session-v1').digest('hex');

const sha = (s: string) => createHash('sha256').update(s).digest(); // equal lengths for timingSafeEqual

export const checkPassword = (input: string) => timingSafeEqual(sha(input), sha(process.env.APP_PASSWORD ?? ''));

export function isSignedIn(cookie: string | undefined): boolean {
  return cookie != null && timingSafeEqual(sha(cookie), sha(sessionToken()));
}
