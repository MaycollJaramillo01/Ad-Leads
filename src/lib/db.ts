// libSQL: a local SQLite file by default; Turso (same SQL, over HTTP) when TURSO_DATABASE_URL is set,
// which is how it runs on Vercel, where functions have no persistent disk.
import type {Client, InStatement, InValue} from '@libsql/client';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS searches (
  id INTEGER PRIMARY KEY,
  query TEXT NOT NULL,
  countries TEXT NOT NULL,              -- JSON array of ISO codes or ["ALL"]
  active_status TEXT NOT NULL DEFAULT 'active',
  media_type TEXT NOT NULL DEFAULT 'all',
  newer_than TEXT,
  results_limit INTEGER NOT NULL,
  enrich INTEGER NOT NULL DEFAULT 1,
  exact INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued',  -- queued | ads | pages | done | error | cancelled
  ads_runs TEXT NOT NULL DEFAULT '',    -- step 1's Apify runs, one per country, space-separated; the last is current
  pages_run_id TEXT,
  progress INTEGER NOT NULL DEFAULT 0,  -- items scraped in the current step
  progress_total INTEGER NOT NULL DEFAULT 0,
  ads_count INTEGER NOT NULL DEFAULT 0,
  advertisers_count INTEGER NOT NULL DEFAULT 0,
  enriched_count INTEGER NOT NULL DEFAULT 0,
  cached_count INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  finished_at TEXT,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  lease_until TEXT,                     -- who may advance it right now (see lease())
  ingest_offset INTEGER NOT NULL DEFAULT 0,  -- dataset items already saved
  cost_final INTEGER NOT NULL DEFAULT 0      -- cost re-read after Apify closed the bill
);

CREATE TABLE IF NOT EXISTS advertisers (
  page_id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  page_url TEXT NOT NULL DEFAULT '',
  profile_pic TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  likes INTEGER,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  instagram TEXT NOT NULL DEFAULT '',
  followers INTEGER,
  rating INTEGER,
  page_created TEXT NOT NULL DEFAULT '',
  enriched_at TEXT,
  status TEXT NOT NULL DEFAULT 'nuevo',  -- nuevo | contactado | interesado | cliente | descartado
  notes TEXT NOT NULL DEFAULT '',
  first_seen TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_seen TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS ads (
  ad_id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL REFERENCES advertisers(page_id) ON DELETE CASCADE,
  search_id INTEGER REFERENCES searches(id) ON DELETE SET NULL,
  country TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  cta TEXT NOT NULL DEFAULT '',
  link_url TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  video_url TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 0,
  start_date TEXT,
  end_date TEXT,
  platforms TEXT NOT NULL DEFAULT '[]',
  variants INTEGER NOT NULL DEFAULT 1,
  first_seen TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS ads_page ON ads(page_id);
CREATE INDEX IF NOT EXISTS ads_country ON ads(country);

CREATE TABLE IF NOT EXISTS search_results (
  search_id INTEGER NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL REFERENCES advertisers(page_id) ON DELETE CASCADE,
  ads_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (search_id, page_id)
);
CREATE INDEX IF NOT EXISTS sr_page ON search_results(page_id);
`;

// Added after the first local release; older database files get them on open.
const LATER_COLUMNS: [string, string][] = [
  ['cancel_requested', 'INTEGER NOT NULL DEFAULT 0'],
  ['lease_until', 'TEXT'],
  ['ingest_offset', 'INTEGER NOT NULL DEFAULT 0'],
  ['cost_final', 'INTEGER NOT NULL DEFAULT 0'],
  ['ads_runs', "TEXT NOT NULL DEFAULT ''"],
];

async function open(): Promise<Client> {
  const url = process.env.TURSO_DATABASE_URL;
  let c: Client;
  if (url) {
    // HTTP client is plain JS, so Vercel functions don't need libSQL's native binary.
    const {createClient} = await import('@libsql/client/web');
    c = createClient({url, authToken: process.env.TURSO_AUTH_TOKEN});
  } else {
    const path = process.env.DB_PATH ?? 'data/scraper.db';
    if (path !== ':memory:') mkdirSync(dirname(path), {recursive: true});
    const {createClient} = await import('@libsql/client');
    c = createClient({url: path === ':memory:' ? ':memory:' : `file:${path}`});
  }
  await c.executeMultiple(SCHEMA);
  const have = new Set((await c.execute('PRAGMA table_info(searches)')).rows.map(r => String(r.name)));
  for (const [name, def] of LATER_COLUMNS) if (!have.has(name)) await c.execute(`ALTER TABLE searches ADD COLUMN ${name} ${def}`);
  return c;
}

let ready: Promise<Client> | undefined;
const db = () =>
  (ready ??= open().catch(e => {
    ready = undefined; // retry on the next request instead of caching the failure
    throw e;
  }));

async function all<T = any>(sql: string, args: InValue[] = []): Promise<T[]> {
  const rs = await (await db()).execute({sql, args});
  return rs.rows.map(r => ({...r})) as T[];
}
const one = async <T = any>(sql: string, args: InValue[] = []): Promise<T | undefined> => (await all<T>(sql, args))[0];
const run = async (sql: string, args: InValue[] = []) => (await db()).execute({sql, args});
/** Statements run in one transaction: all of them or none. */
async function batch(stmts: InStatement[]) {
  if (stmts.length) await (await db()).batch(stmts, 'write');
}

// ============= TYPES =============

export type SearchStatus = 'queued' | 'ads' | 'pages' | 'done' | 'error' | 'cancelled';
export const RUNNING: SearchStatus[] = ['queued', 'ads', 'pages'];
export const LEAD_STATUSES = ['nuevo', 'contactado', 'interesado', 'cliente', 'descartado'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export interface SearchRow {
  id: number;
  query: string;
  countries: string[];
  active_status: string;
  media_type: string;
  newer_than: string | null;
  results_limit: number;
  enrich: boolean;
  exact: boolean;
  status: SearchStatus;
  ads_runs: string;
  pages_run_id: string | null;
  progress: number;
  progress_total: number;
  ads_count: number;
  advertisers_count: number;
  enriched_count: number;
  cached_count: number;
  with_email: number;
  with_phone: number;
  cost_usd: number;
  error: string | null;
  created_at: string;
  finished_at: string | null;
  cancel_requested: boolean;
  lease_until: string | null;
  ingest_offset: number;
  cost_final: boolean;
}

export interface NewSearch {
  query: string;
  countries: string[];
  active_status: string;
  media_type: string;
  newer_than: string | null;
  results_limit: number;
  enrich: boolean;
  exact: boolean;
}

export interface ScrapedAd {
  adId: string;
  pageId: string;
  pageName: string;
  pageUrl: string;
  profilePic: string;
  category: string;
  likes: number | null;
  country: string;
  body: string;
  title: string;
  cta: string;
  linkUrl: string;
  imageUrl: string;
  videoUrl: string;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  platforms: string[];
  variants: number;
}

export interface Contact {
  email: string;
  phone: string;
  address: string;
  website: string;
  instagram: string;
  category: string;
  followers: number | null;
  rating: number | null;
  pageCreated: string;
  profilePic: string;
}

const now = () => new Date().toISOString();

// ============= SEARCHES =============

const SEARCH_SELECT = `
  SELECT s.*,
    (SELECT COUNT(*) FROM search_results r JOIN advertisers a USING(page_id) WHERE r.search_id = s.id AND a.email <> '') AS with_email,
    (SELECT COUNT(*) FROM search_results r JOIN advertisers a USING(page_id) WHERE r.search_id = s.id AND a.phone <> '') AS with_phone
  FROM searches s`;

function toSearch(r: any): SearchRow {
  return {
    ...r,
    countries: JSON.parse(r.countries),
    enrich: Boolean(r.enrich),
    exact: Boolean(r.exact),
    cancel_requested: Boolean(r.cancel_requested),
    cost_final: Boolean(r.cost_final),
  };
}

export async function createSearch(s: NewSearch): Promise<SearchRow> {
  const row = await one<{id: number}>(
    `INSERT INTO searches (query, countries, active_status, media_type, newer_than, results_limit, enrich, exact, progress_total)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [s.query, JSON.stringify(s.countries), s.active_status, s.media_type, s.newer_than, s.results_limit, s.enrich ? 1 : 0, s.exact ? 1 : 0, s.results_limit * s.countries.length],
  );
  return (await getSearch(Number(row!.id)))!;
}

export async function getSearch(id: number): Promise<SearchRow | null> {
  const r = await one(`${SEARCH_SELECT} WHERE s.id = ?`, [id]);
  return r ? toSearch(r) : null;
}

export async function listSearches(limit = 100): Promise<SearchRow[]> {
  return (await all(`${SEARCH_SELECT} ORDER BY s.id DESC LIMIT ?`, [limit])).map(toSearch);
}

/** Unfinished searches, oldest first: the first one is the one being worked on. */
export async function listRunningSearches(): Promise<SearchRow[]> {
  return (await all(`${SEARCH_SELECT} WHERE s.status IN (${RUNNING.map(() => '?').join(',')}) ORDER BY s.id`, RUNNING)).map(toSearch);
}

export type SearchPatch = Partial<Omit<SearchRow, 'id' | 'countries' | 'enrich' | 'exact' | 'with_email' | 'with_phone'>>;
function searchUpdate(id: number, patch: SearchPatch): InStatement {
  const keys = Object.keys(patch);
  const value = (v: unknown) => (v === true ? 1 : v === false ? 0 : ((v ?? null) as InValue));
  return {sql: `UPDATE searches SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, args: [...keys.map(k => value((patch as any)[k])), id]};
}
export async function updateSearch(id: number, patch: SearchPatch) {
  if (Object.keys(patch).length) await batch([searchUpdate(id, patch)]);
}

/** The search goes; the advertisers and ads it found stay in the database. */
export async function deleteSearch(id: number) {
  await batch([
    {sql: 'DELETE FROM search_results WHERE search_id = ?', args: [id]},
    {sql: 'UPDATE ads SET search_id = NULL WHERE search_id = ?', args: [id]},
    {sql: 'DELETE FROM searches WHERE id = ?', args: [id]},
  ]);
}

/**
 * Claim a search for `seconds` so concurrent requests (polls, webhooks, the local timer) don't
 * advance it twice. Expires on its own if the holder dies.
 */
export async function lease(id: number, seconds: number): Promise<boolean> {
  const t = Date.now();
  const rs = await run('UPDATE searches SET lease_until = ? WHERE id = ? AND (lease_until IS NULL OR lease_until < ?)', [
    new Date(t + seconds * 1000).toISOString(),
    id,
    new Date(t).toISOString(),
  ]);
  return rs.rowsAffected === 1;
}
export const release = (id: number) => run('UPDATE searches SET lease_until = NULL WHERE id = ?', [id]);

/** Finished searches whose cost was read before Apify finished billing (it lags ~30 s). */
export async function searchesToReconcile(): Promise<Pick<SearchRow, 'id' | 'ads_runs' | 'pages_run_id'>[]> {
  return all(
    `SELECT id, ads_runs, pages_run_id FROM searches
     WHERE cost_final = 0 AND status IN ('done', 'error', 'cancelled') AND finished_at < ? ORDER BY id LIMIT 5`,
    [new Date(Date.now() - 90_000).toISOString()],
  );
}

// ============= INGEST =============

const UPSERT_ADV = `
  INSERT INTO advertisers (page_id, name, page_url, profile_pic, category, likes, last_seen)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(page_id) DO UPDATE SET
    name = excluded.name,
    page_url = CASE WHEN excluded.page_url <> '' THEN excluded.page_url ELSE advertisers.page_url END,
    profile_pic = CASE WHEN excluded.profile_pic <> '' THEN excluded.profile_pic ELSE advertisers.profile_pic END,
    category = CASE WHEN advertisers.category = '' THEN excluded.category ELSE advertisers.category END,
    likes = COALESCE(excluded.likes, advertisers.likes),
    last_seen = excluded.last_seen`;
const UPSERT_AD = `
  INSERT INTO ads (ad_id, page_id, search_id, country, body, title, cta, link_url, image_url, video_url, is_active, start_date, end_date, platforms, variants)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(ad_id) DO UPDATE SET
    is_active = excluded.is_active, end_date = excluded.end_date, variants = excluded.variants,
    image_url = CASE WHEN excluded.image_url <> '' THEN excluded.image_url ELSE ads.image_url END`;
const LINK = `
  INSERT INTO search_results (search_id, page_id, ads_count) VALUES (?, ?, ?)
  ON CONFLICT(search_id, page_id) DO UPDATE SET ads_count = search_results.ads_count + excluded.ads_count`;

/**
 * Save one page of the ads dataset and move the search's `ingest_offset` past it, in one
 * transaction. A retry after a crash therefore resumes exactly where the last page ended and
 * never counts the same items twice.
 */
export async function ingestAds(searchId: number, ads: ScrapedAd[], nextOffset: number) {
  const ts = now();
  const perPage = new Map<string, number>();
  const stmts: InStatement[] = [];
  for (const a of ads) {
    stmts.push(
      {sql: UPSERT_ADV, args: [a.pageId, a.pageName, a.pageUrl, a.profilePic, a.category, a.likes, ts]},
      {
        sql: UPSERT_AD,
        args: [
          a.adId, a.pageId, searchId, a.country, a.body, a.title, a.cta, a.linkUrl, a.imageUrl, a.videoUrl,
          a.isActive ? 1 : 0, a.startDate, a.endDate, JSON.stringify(a.platforms), a.variants,
        ],
      },
    );
    perPage.set(a.pageId, (perPage.get(a.pageId) ?? 0) + 1);
  }
  for (const [pageId, n] of perPage) stmts.push({sql: LINK, args: [searchId, pageId, n]});
  stmts.push(searchUpdate(searchId, {ingest_offset: nextOffset}));
  await batch(stmts);
}

/** Ads and distinct advertisers saved for a search so far. */
export async function searchCounts(searchId: number): Promise<{ads: number; advertisers: number}> {
  const r = await one('SELECT COALESCE(SUM(ads_count), 0) ads, COUNT(*) advertisers FROM search_results WHERE search_id = ?', [searchId]);
  return {ads: Number(r.ads), advertisers: Number(r.advertisers)};
}

const ENRICH_TTL_DAYS = 30;

/** Advertisers of a search that still need contact data (never enriched or stale). */
export async function pagesToEnrich(searchId: number): Promise<{page_id: string; page_url: string}[]> {
  return all(
    `SELECT a.page_id, a.page_url FROM search_results r JOIN advertisers a USING(page_id)
     WHERE r.search_id = ? AND a.page_url <> ''
       AND (a.enriched_at IS NULL OR a.enriched_at < ?)`,
    [searchId, new Date(Date.now() - ENRICH_TTL_DAYS * 864e5).toISOString()],
  );
}

/**
 * Store the contacts found, mark every page that was tried (so it isn't billed again for 30 days
 * even if it had nothing), and close the step — atomically.
 */
export async function saveContacts(searchId: number, found: {pageId: string; contact: Contact}[], tried: string[], patch: SearchPatch) {
  const ts = now();
  await batch([
    ...found.map(({pageId, contact: c}) => ({
      sql: `UPDATE advertisers SET email = ?, phone = ?, address = ?, website = ?, instagram = ?,
              category = CASE WHEN ? <> '' THEN ? ELSE category END,
              followers = COALESCE(?, followers), rating = ?, page_created = ?,
              profile_pic = CASE WHEN ? <> '' THEN ? ELSE profile_pic END,
              enriched_at = ?
            WHERE page_id = ?`,
      args: [
        c.email, c.phone, c.address, c.website, c.instagram, c.category, c.category, c.followers, c.rating,
        c.pageCreated, c.profilePic, c.profilePic, ts, pageId,
      ],
    })),
    ...tried.map(id => ({sql: 'UPDATE advertisers SET enriched_at = ? WHERE page_id = ? AND enriched_at IS NULL', args: [ts, id]})),
    searchUpdate(searchId, patch),
  ]);
}

// ============= ADVERTISERS =============

export interface AdvertiserFilter {
  q?: string;
  status?: string;
  countries?: string[];
  contact?: 'email' | 'phone' | 'any' | 'none';
  searchId?: number;
  ids?: string[];
  sort?: string;
  dir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

const SORTS: Record<string, string> = {
  name: 'a.name COLLATE NOCASE',
  email: "a.email = '', a.email",
  phone: "a.phone = '', a.phone",
  address: "a.address = '', a.address",
  status: 'a.status',
  ads: 'ads_total',
  followers: 'a.followers',
  last_seen: 'a.last_seen',
};

function where(f: AdvertiserFilter): {sql: string; args: InValue[]} {
  const parts: string[] = [];
  const args: InValue[] = [];
  if (f.q) {
    parts.push(`(a.name LIKE ? OR a.email LIKE ? OR a.phone LIKE ? OR a.address LIKE ? OR a.category LIKE ? OR a.website LIKE ? OR a.notes LIKE ?)`);
    const like = `%${f.q}%`;
    args.push(like, like, like, like, like, like, like);
  }
  if (f.status) {
    parts.push('a.status = ?');
    args.push(f.status);
  }
  if (f.countries?.length) {
    parts.push(`EXISTS (SELECT 1 FROM ads x WHERE x.page_id = a.page_id AND x.country IN (${f.countries.map(() => '?').join(',')}))`);
    args.push(...f.countries);
  }
  if (f.contact === 'email') parts.push("a.email <> ''");
  if (f.contact === 'phone') parts.push("a.phone <> ''");
  if (f.contact === 'any') parts.push("(a.email <> '' OR a.phone <> '')");
  if (f.contact === 'none') parts.push("a.email = '' AND a.phone = ''");
  if (f.searchId) {
    parts.push('EXISTS (SELECT 1 FROM search_results r WHERE r.page_id = a.page_id AND r.search_id = ?)');
    args.push(f.searchId);
  }
  if (f.ids?.length) {
    parts.push(`a.page_id IN (${f.ids.map(() => '?').join(',')})`);
    args.push(...f.ids);
  }
  return {sql: parts.length ? `WHERE ${parts.join(' AND ')}` : '', args};
}

const ADV_COLUMNS = `
  a.*,
  (SELECT COUNT(*) FROM ads x WHERE x.page_id = a.page_id) AS ads_total,
  (SELECT COUNT(*) FROM ads x WHERE x.page_id = a.page_id AND x.is_active = 1) AS ads_active,
  (SELECT group_concat(DISTINCT x.country) FROM ads x WHERE x.page_id = a.page_id AND x.country <> '') AS countries`;

function toAdvertiser(r: any) {
  return {...r, countries: r.countries ? String(r.countries).split(',') : []};
}

export async function listAdvertisers(f: AdvertiserFilter) {
  const {sql, args} = where(f);
  const pageSize = Math.min(Math.max(f.pageSize ?? 50, 1), 500);
  const page = Math.max(f.page ?? 1, 1);
  const order = SORTS[f.sort ?? ''] ?? 'ads_total';
  const dir = f.dir === 'asc' ? 'ASC' : 'DESC';
  const total = Number((await one(`SELECT COUNT(*) n FROM advertisers a ${sql}`, args)).n);
  const items = (
    await all(
      `SELECT ${ADV_COLUMNS} FROM advertisers a ${sql} ORDER BY ${order.split(', ').map(o => (o.endsWith("= ''") ? o : `${o} ${dir}`)).join(', ')}, a.page_id LIMIT ? OFFSET ?`,
      [...args, pageSize, (page - 1) * pageSize],
    )
  ).map(toAdvertiser);
  return {items, total, page, pageSize};
}

/** Every matching row, for CSV export. */
export async function allAdvertisers(f: AdvertiserFilter) {
  const {sql, args} = where(f);
  return (await all(`SELECT ${ADV_COLUMNS} FROM advertisers a ${sql} ORDER BY ads_total DESC`, args)).map(toAdvertiser);
}

export async function getAdvertiser(pageId: string) {
  const r = await one(`SELECT ${ADV_COLUMNS} FROM advertisers a WHERE a.page_id = ?`, [pageId]);
  if (!r) return null;
  const ads = (await all('SELECT * FROM ads WHERE page_id = ? ORDER BY is_active DESC, start_date DESC LIMIT 100', [pageId])).map(
    (a: any) => ({...a, is_active: Boolean(a.is_active), platforms: JSON.parse(a.platforms)}),
  );
  const searches = (
    await all(
      `SELECT s.id, s.query, s.countries, s.created_at, r.ads_count FROM search_results r JOIN searches s ON s.id = r.search_id
       WHERE r.page_id = ? ORDER BY s.id DESC`,
      [pageId],
    )
  ).map((s: any) => ({...s, countries: JSON.parse(s.countries)}));
  return {...toAdvertiser(r), ads, searches};
}

const checkStatus = (status: string) => {
  if (!(LEAD_STATUSES as readonly string[]).includes(status)) throw new Error('Estado no válido');
};

export async function updateAdvertiser(pageId: string, patch: {status?: string; notes?: string}) {
  if (patch.status !== undefined) {
    checkStatus(patch.status);
    await run('UPDATE advertisers SET status = ? WHERE page_id = ?', [patch.status, pageId]);
  }
  if (patch.notes !== undefined) await run('UPDATE advertisers SET notes = ? WHERE page_id = ?', [patch.notes.slice(0, 5000), pageId]);
}

export async function bulkStatus(pageIds: string[], status: string) {
  checkStatus(status);
  await batch(pageIds.map(id => ({sql: 'UPDATE advertisers SET status = ? WHERE page_id = ?', args: [status, id]})));
}

// ============= STATS =============

export async function stats() {
  const r = await one(`SELECT
    (SELECT COUNT(*) FROM advertisers) advertisers,
    (SELECT COUNT(*) FROM advertisers WHERE email <> '') withEmail,
    (SELECT COUNT(*) FROM advertisers WHERE phone <> '') withPhone,
    (SELECT COUNT(*) FROM advertisers WHERE address <> '') withAddress,
    (SELECT COUNT(*) FROM ads) ads,
    (SELECT COUNT(*) FROM searches) searches,
    (SELECT COUNT(*) FROM searches WHERE status IN ('queued','ads','pages')) running,
    (SELECT COALESCE(SUM(cost_usd), 0) FROM searches) costUsd`);
  return {
    ...r,
    byStatus: await all<{status: string; n: number}>('SELECT status, COUNT(*) n FROM advertisers GROUP BY status'),
    topCountries: await all<{country: string; n: number}>(
      "SELECT country, COUNT(DISTINCT page_id) n FROM ads WHERE country <> '' GROUP BY country ORDER BY n DESC LIMIT 8",
    ),
  };
}
