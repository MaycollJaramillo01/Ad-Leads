// SQLite via Node's built-in driver: no native build step, one file on disk.
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';

const DB_PATH = process.env.DB_PATH ?? 'data/scraper.db';
if (DB_PATH !== ':memory:') mkdirSync(dirname(DB_PATH), {recursive: true});

export const db = new DatabaseSync(DB_PATH);
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

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
  ads_run_id TEXT,
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
  finished_at TEXT
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
`);

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
  ads_run_id: string | null;
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
  return {...r, countries: JSON.parse(r.countries), enrich: Boolean(r.enrich), exact: Boolean(r.exact)};
}

export function createSearch(s: NewSearch): SearchRow {
  const {lastInsertRowid} = db
    .prepare(
      `INSERT INTO searches (query, countries, active_status, media_type, newer_than, results_limit, enrich, exact, progress_total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(s.query, JSON.stringify(s.countries), s.active_status, s.media_type, s.newer_than, s.results_limit, s.enrich ? 1 : 0, s.exact ? 1 : 0, s.results_limit * s.countries.length);
  return getSearch(Number(lastInsertRowid))!;
}

export function getSearch(id: number): SearchRow | null {
  const r = db.prepare(`${SEARCH_SELECT} WHERE s.id = ?`).get(id);
  return r ? toSearch(r) : null;
}

export function listSearches(limit = 100): SearchRow[] {
  return db.prepare(`${SEARCH_SELECT} ORDER BY s.id DESC LIMIT ?`).all(limit).map(toSearch);
}

export function listRunningSearches(): SearchRow[] {
  return db
    .prepare(`${SEARCH_SELECT} WHERE s.status IN (${RUNNING.map(() => '?').join(',')}) ORDER BY s.id`)
    .all(...RUNNING)
    .map(toSearch);
}

type SearchPatch = Partial<Omit<SearchRow, 'id' | 'countries' | 'enrich' | 'exact' | 'with_email' | 'with_phone'>>;
export function updateSearch(id: number, patch: SearchPatch) {
  const keys = Object.keys(patch);
  if (keys.length === 0) return;
  db.prepare(`UPDATE searches SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`).run(
    ...keys.map(k => (patch as any)[k] ?? null),
    id,
  );
}

export function deleteSearch(id: number) {
  db.prepare('DELETE FROM searches WHERE id = ?').run(id);
}

// ============= INGEST =============

/** Store scraped ads, upsert their advertisers and link both to the search. Returns distinct advertisers. */
export function ingestAds(searchId: number, ads: ScrapedAd[]): number {
  const upsertAdv = db.prepare(`
    INSERT INTO advertisers (page_id, name, page_url, profile_pic, category, likes, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(page_id) DO UPDATE SET
      name = excluded.name,
      page_url = CASE WHEN excluded.page_url <> '' THEN excluded.page_url ELSE advertisers.page_url END,
      profile_pic = CASE WHEN excluded.profile_pic <> '' THEN excluded.profile_pic ELSE advertisers.profile_pic END,
      category = CASE WHEN advertisers.category = '' THEN excluded.category ELSE advertisers.category END,
      likes = COALESCE(excluded.likes, advertisers.likes),
      last_seen = excluded.last_seen`);
  const upsertAd = db.prepare(`
    INSERT INTO ads (ad_id, page_id, search_id, country, body, title, cta, link_url, image_url, video_url, is_active, start_date, end_date, platforms, variants)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ad_id) DO UPDATE SET
      is_active = excluded.is_active, end_date = excluded.end_date, variants = excluded.variants,
      image_url = CASE WHEN excluded.image_url <> '' THEN excluded.image_url ELSE ads.image_url END`);
  // Set, not increment: re-ingesting the same run after a restart must not double the counts.
  const link = db.prepare(`
    INSERT INTO search_results (search_id, page_id, ads_count) VALUES (?, ?, ?)
    ON CONFLICT(search_id, page_id) DO UPDATE SET ads_count = excluded.ads_count`);

  const ts = now();
  const perPage = new Map<string, number>();
  db.exec('BEGIN');
  try {
    for (const a of ads) {
      upsertAdv.run(a.pageId, a.pageName, a.pageUrl, a.profilePic, a.category, a.likes, ts);
      upsertAd.run(
        a.adId, a.pageId, searchId, a.country, a.body, a.title, a.cta, a.linkUrl, a.imageUrl, a.videoUrl,
        a.isActive ? 1 : 0, a.startDate, a.endDate, JSON.stringify(a.platforms), a.variants,
      );
      perPage.set(a.pageId, (perPage.get(a.pageId) ?? 0) + 1);
    }
    for (const [pageId, n] of perPage) link.run(searchId, pageId, n);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return perPage.size;
}

const ENRICH_TTL_DAYS = 30;

/** Advertisers of a search that still need contact data (never enriched or stale). */
export function pagesToEnrich(searchId: number): {page_id: string; page_url: string}[] {
  return db
    .prepare(
      `SELECT a.page_id, a.page_url FROM search_results r JOIN advertisers a USING(page_id)
       WHERE r.search_id = ? AND a.page_url <> ''
         AND (a.enriched_at IS NULL OR a.enriched_at < ?)`,
    )
    .all(searchId, new Date(Date.now() - ENRICH_TTL_DAYS * 864e5).toISOString()) as any;
}

export function applyContact(pageId: string, c: Contact) {
  db.prepare(
    `UPDATE advertisers SET email = ?, phone = ?, address = ?, website = ?, instagram = ?,
       category = CASE WHEN ? <> '' THEN ? ELSE category END,
       followers = COALESCE(?, followers), rating = ?, page_created = ?,
       profile_pic = CASE WHEN ? <> '' THEN ? ELSE profile_pic END,
       enriched_at = ?
     WHERE page_id = ?`,
  ).run(
    c.email, c.phone, c.address, c.website, c.instagram, c.category, c.category, c.followers, c.rating,
    c.pageCreated, c.profilePic, c.profilePic, now(), pageId,
  );
}

/** Pages the scraper could not open still count as tried, so they are not re-billed for 30 days. */
export function markEnriched(pageIds: string[]) {
  const st = db.prepare('UPDATE advertisers SET enriched_at = ? WHERE page_id = ? AND enriched_at IS NULL');
  const ts = now();
  for (const id of pageIds) st.run(ts, id);
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

function where(f: AdvertiserFilter): {sql: string; args: any[]} {
  const parts: string[] = [];
  const args: any[] = [];
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

export function listAdvertisers(f: AdvertiserFilter) {
  const {sql, args} = where(f);
  const pageSize = Math.min(Math.max(f.pageSize ?? 50, 1), 500);
  const page = Math.max(f.page ?? 1, 1);
  const order = SORTS[f.sort ?? ''] ?? 'ads_total';
  const dir = f.dir === 'asc' ? 'ASC' : 'DESC';
  const total = (db.prepare(`SELECT COUNT(*) n FROM advertisers a ${sql}`).get(...args) as any).n as number;
  const items = db
    .prepare(`SELECT ${ADV_COLUMNS} FROM advertisers a ${sql} ORDER BY ${order.split(', ').map(o => (o.endsWith("= ''") ? o : `${o} ${dir}`)).join(', ')}, a.page_id LIMIT ? OFFSET ?`)
    .all(...args, pageSize, (page - 1) * pageSize)
    .map(toAdvertiser);
  return {items, total, page, pageSize};
}

/** Every matching row, for CSV export. */
export function allAdvertisers(f: AdvertiserFilter) {
  const {sql, args} = where(f);
  return db.prepare(`SELECT ${ADV_COLUMNS} FROM advertisers a ${sql} ORDER BY ads_total DESC`).all(...args).map(toAdvertiser);
}

export function getAdvertiser(pageId: string) {
  const r = db.prepare(`SELECT ${ADV_COLUMNS} FROM advertisers a WHERE a.page_id = ?`).get(pageId);
  if (!r) return null;
  const ads = db
    .prepare('SELECT * FROM ads WHERE page_id = ? ORDER BY is_active DESC, start_date DESC LIMIT 100')
    .all(pageId)
    .map((a: any) => ({...a, is_active: Boolean(a.is_active), platforms: JSON.parse(a.platforms)}));
  const searches = db
    .prepare(
      `SELECT s.id, s.query, s.countries, s.created_at, r.ads_count FROM search_results r JOIN searches s ON s.id = r.search_id
       WHERE r.page_id = ? ORDER BY s.id DESC`,
    )
    .all(pageId)
    .map((s: any) => ({...s, countries: JSON.parse(s.countries)}));
  return {...toAdvertiser(r), ads, searches};
}

export function updateAdvertiser(pageId: string, patch: {status?: string; notes?: string}) {
  if (patch.status !== undefined) {
    if (!(LEAD_STATUSES as readonly string[]).includes(patch.status)) throw new Error('Estado no válido');
    db.prepare('UPDATE advertisers SET status = ? WHERE page_id = ?').run(patch.status, pageId);
  }
  if (patch.notes !== undefined) {
    db.prepare('UPDATE advertisers SET notes = ? WHERE page_id = ?').run(patch.notes.slice(0, 5000), pageId);
  }
}

export function bulkStatus(pageIds: string[], status: string) {
  if (!(LEAD_STATUSES as readonly string[]).includes(status)) throw new Error('Estado no válido');
  const st = db.prepare('UPDATE advertisers SET status = ? WHERE page_id = ?');
  db.exec('BEGIN');
  for (const id of pageIds) st.run(status, id);
  db.exec('COMMIT');
}

// ============= STATS =============

export function stats() {
  const one = (sql: string) => (db.prepare(sql).get() as any).n as number;
  return {
    advertisers: one('SELECT COUNT(*) n FROM advertisers'),
    withEmail: one("SELECT COUNT(*) n FROM advertisers WHERE email <> ''"),
    withPhone: one("SELECT COUNT(*) n FROM advertisers WHERE phone <> ''"),
    withAddress: one("SELECT COUNT(*) n FROM advertisers WHERE address <> ''"),
    ads: one('SELECT COUNT(*) n FROM ads'),
    searches: one('SELECT COUNT(*) n FROM searches'),
    running: one(`SELECT COUNT(*) n FROM searches WHERE status IN ('queued','ads','pages')`),
    costUsd: (db.prepare('SELECT COALESCE(SUM(cost_usd),0) n FROM searches').get() as any).n as number,
    byStatus: db.prepare('SELECT status, COUNT(*) n FROM advertisers GROUP BY status').all() as {status: string; n: number}[],
    topCountries: db
      .prepare("SELECT country, COUNT(DISTINCT page_id) n FROM ads WHERE country <> '' GROUP BY country ORDER BY n DESC LIMIT 8")
      .all() as {country: string; n: number}[],
  };
}
