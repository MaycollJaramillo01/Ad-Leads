// Run: npm run check  — offline, against real actor output saved in ./fixtures.
process.env.DB_PATH = ':memory:';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const {advertisersCsv} = await import('./csv.ts');
const db = await import('./db.ts');
const {adsActorInput, contactKeys, libraryUrls, mapAd, mapContact, normUrl} = await import('./scrape.ts');

const fixture = (f: string) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));

// --- URLs: one per country, pasted Facebook URLs pass through
const base = {query: 'dentist', countries: ['US', 'MX'], active_status: 'active', media_type: 'video', exact: true};
const urls = libraryUrls(base);
assert.equal(urls.length, 2);
assert.match(urls[1], /country=MX/);
assert.match(urls[0], /search_type=keyword_exact_phrase/);
assert.match(urls[0], /media_type=video/);
assert.deepEqual(libraryUrls({...base, query: 'https://www.facebook.com/nike'}), ['https://www.facebook.com/nike']);
assert.equal(adsActorInput({...base, newer_than: '2026-01-01', results_limit: 20, enrich: true}).onlyAdsNewerThan, '2026-01-01');

// --- Real ads → records
const raw = fixture('ads.json');
const ads = raw.map(mapAd).filter((a: unknown) => a != null);
assert.equal(ads.length, raw.length);
assert.equal(ads[0].country, 'US');
assert.ok(ads.every((a: any) => a.pageUrl.startsWith('https://www.facebook.com/')));

// A synthetic ad from the page we have contact data for
const page = fixture('page.json')[0];
ads.push({...ads[0], adId: 'x1', pageId: 'pk', pageName: 'Copper Kettle', pageUrl: 'https://facebook.com/copperkettleyqr', country: 'CA'});

const s = db.createSearch({query: 'dentist', countries: ['US', 'CA'], active_status: 'active', media_type: 'all', newer_than: null, results_limit: 5, enrich: true, exact: false});
const n = db.ingestAds(s.id, ads);
assert.equal(db.ingestAds(s.id, ads), n, 'ingest is idempotent');
assert.equal(db.getSearch(s.id)!.progress_total, 10);

// --- Contact join by normalized URL
const todo = db.pagesToEnrich(s.id);
assert.equal(todo.length, n);
const keyed = new Map(contactKeys(page).map(k => [k, page]));
const hit = todo.find(t => keyed.has(normUrl(t.page_url)));
assert.ok(hit, 'copperkettle page matched by URL despite www/no-www');
db.applyContact(hit!.page_id, mapContact(page));
db.markEnriched(todo.map(t => t.page_id));
assert.equal(db.pagesToEnrich(s.id).length, 0, 'enriched pages are cached');

// --- Filters, sorting, CRM status
const withEmail = db.listAdvertisers({contact: 'email'});
assert.equal(withEmail.total, 1);
assert.equal(withEmail.items[0].email, 'copperkettle.events@gmail.com');
assert.deepEqual(withEmail.items[0].countries, ['CA']);
assert.equal(db.listAdvertisers({countries: ['CA']}).total, 1);
assert.equal(db.listAdvertisers({searchId: s.id}).total, n);
assert.equal(db.listAdvertisers({q: 'kettle'}).total, 1);
const byEmail = db.listAdvertisers({sort: 'email', dir: 'desc'}).items;
assert.equal(byEmail[0].email, 'copperkettle.events@gmail.com', 'rows without email sort last either way');
db.updateAdvertiser('pk', {status: 'contactado', notes: 'Llamar el lunes'});
assert.equal(db.listAdvertisers({status: 'contactado'}).items[0].notes, 'Llamar el lunes');
assert.throws(() => db.updateAdvertiser('pk', {status: 'hackeado'}));
assert.equal(db.getSearch(s.id)!.with_email, 1);

const detail = db.getAdvertiser('pk')!;
assert.equal(detail.ads.length, 1);
assert.equal(detail.searches[0].id, s.id);

// --- CSV
const csv = advertisersCsv([{...detail, phone: '+1 306-525-3545', notes: '=cmd|x'}]);
assert.ok(csv.startsWith('﻿Anunciante,'));
assert.ok(csv.includes(',+1 306-525-3545,'));
assert.ok(csv.includes(",'=cmd|x,"));
assert.ok(csv.includes('"1953 Scarth Street, Regina, SK, Canada, S4P 2H1"'));
assert.ok(csv.includes('view_all_page_id=pk'));

// --- Deleting a search keeps the advertisers database
db.updateSearch(s.id, {status: 'done'});
db.deleteSearch(s.id);
assert.equal(db.listAdvertisers({}).total, n);
assert.equal(db.stats().searches, 0);

console.log('backend ok');
