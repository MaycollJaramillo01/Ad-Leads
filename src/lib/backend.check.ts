// Run: npm run check — offline, against real actor output saved in ./fixtures.
process.env.DB_PATH = ':memory:';
delete process.env.TURSO_DATABASE_URL; // never touch the real database
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const {advertisersCsv} = await import('./csv.ts');
const db = await import('./db.ts');
const {adsActorInput, contactKeys, libraryUrls, mapAd, mapContact, normUrl, pagesActorInput} = await import('./scrape.ts');

const fixture = (f: string) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));

// --- URLs: one per country, pasted Facebook URLs pass through, date filter goes in the URL
const base = {query: 'dentist', countries: ['US', 'MX'], active_status: 'active', media_type: 'video', exact: true, newer_than: null};
const urls = libraryUrls(base);
assert.equal(urls.length, 2);
assert.match(urls[1], /country=MX/);
assert.match(urls[0], /search_type=keyword_exact_phrase/);
assert.match(urls[0], /media_type=video/);
assert.deepEqual(libraryUrls({...base, query: 'https://www.facebook.com/nike'}), ['https://www.facebook.com/nike']);
assert.equal(new URL(libraryUrls({...base, newer_than: '2026-01-01'})[0]).searchParams.get('start_date[min]'), '2026-01-01');
// One run per country, each capped at the limit
const input = adsActorInput({...base, results_limit: 20, enrich: true}, urls[1]);
assert.deepEqual([input.urls, input.limitPerSource, input.count], [[{url: urls[1]}], 20, 20]);

// --- Real ads → records
const raw = fixture('ads.json');
const ads = raw.map(mapAd).filter((a: unknown) => a != null);
assert.equal(ads.length, raw.length);
assert.ok(ads.every((a: any) => a.country === 'MX' && a.pageUrl.startsWith('https://www.facebook.com/')));
assert.match(ads[0].startDate, /^\d{4}-\d{2}-\d{2}T/);
assert.ok(ads[0].body.length > 0 && (ads[0].imageUrl || ads[0].videoUrl));

const s = await db.createSearch({query: 'dentista', countries: ['MX'], active_status: 'active', media_type: 'all', newer_than: null, results_limit: 5, enrich: true, exact: false});
assert.equal(s.progress_total, 5);
// Two dataset pages; each moves ingest_offset in the same transaction as its rows.
await db.ingestAds(s.id, ads.slice(0, 2), 2);
await db.ingestAds(s.id, ads.slice(2), ads.length);
assert.equal((await db.getSearch(s.id))!.ingest_offset, ads.length);
const {ads: adCount, advertisers: n} = await db.searchCounts(s.id);
assert.deepEqual([adCount, n], [3, 3]);

// --- Contacts: matched by page ID or URL; JSON escapes and bare domains cleaned up
const todo = await db.pagesToEnrich(s.id);
assert.equal(todo.length, n);
assert.equal(pagesActorInput(todo).urls.length, n);
const byKey = new Map<string, any>();
for (const p of fixture('pages.json')) for (const k of contactKeys(p)) byKey.set(k, p);
const found = todo.flatMap(t => {
  const p = byKey.get(t.page_id) ?? byKey.get(normUrl(t.page_url));
  return p ? [{pageId: t.page_id, contact: mapContact(p)}] : [];
});
assert.equal(found.length, 2);
const ceyesov = found.find(f => f.pageId === '232733040158146')!.contact;
assert.equal(ceyesov.email, 'ceyesov_2006@hotmail.com');
assert.equal(ceyesov.phone, '+52 229 903 6290');
assert.equal(ceyesov.address, 'Simón Bolivar No.339 Col. Ignacio Zaragoza, Veracruz, Mexico');
assert.equal(ceyesov.website, 'https://uniceyesov.edu.mx/index.html');
assert.equal(ceyesov.instagram, 'https://www.instagram.com/ceyesov');
assert.deepEqual([ceyesov.followers, ceyesov.rating], [74000, 96]);
await db.saveContacts(s.id, found, todo.map(t => t.page_id), {status: 'done', enriched_count: found.length, finished_at: '2026-01-01T00:00:00.000Z'});
assert.equal((await db.pagesToEnrich(s.id)).length, 0, 'every tried page is cached for 30 days');

// --- Lease: one request advances a search at a time
assert.equal(await db.lease(s.id, 60), true);
assert.equal(await db.lease(s.id, 60), false);
await db.release(s.id);
assert.equal(await db.lease(s.id, 60), true);
await db.release(s.id);

// --- Cost is re-read once after Apify closes the bill
assert.ok((await db.searchesToReconcile()).some(r => r.id === s.id));
await db.updateSearch(s.id, {cost_usd: 0.04, cost_final: true});
assert.equal((await db.searchesToReconcile()).length, 0);

// --- Filters, sorting, CRM status
const withEmail = await db.listAdvertisers({contact: 'email'});
assert.equal(withEmail.total, 1);
assert.equal(withEmail.items[0].email, 'ceyesov_2006@hotmail.com');
assert.deepEqual(withEmail.items[0].countries, ['MX']);
assert.equal((await db.listAdvertisers({contact: 'phone'})).total, 2);
assert.equal((await db.listAdvertisers({contact: 'none'})).total, 1);
assert.equal((await db.listAdvertisers({countries: ['MX']})).total, 3);
assert.equal((await db.listAdvertisers({searchId: s.id})).total, n);
assert.equal((await db.listAdvertisers({q: 'veracruz'})).total, 1);
const byEmail = (await db.listAdvertisers({sort: 'email', dir: 'desc'})).items;
assert.equal(byEmail[0].email, 'ceyesov_2006@hotmail.com', 'rows without email sort last either way');
await db.updateAdvertiser('232733040158146', {status: 'contactado', notes: 'Llamar el lunes'});
assert.equal((await db.listAdvertisers({status: 'contactado'})).items[0].notes, 'Llamar el lunes');
await assert.rejects(db.updateAdvertiser('232733040158146', {status: 'hackeado'}));
await db.bulkStatus(['1647795985469904', '406380953443426'], 'interesado');
assert.equal((await db.listAdvertisers({status: 'interesado'})).total, 2);
assert.deepEqual([(await db.getSearch(s.id))!.with_email, (await db.getSearch(s.id))!.with_phone], [1, 2]);

const detail = (await db.getAdvertiser('232733040158146'))!;
assert.equal(detail.ads.length, 1);
assert.equal(detail.searches[0].id, s.id);

// --- CSV
const csv = advertisersCsv([{...detail, notes: '=cmd|x'}]);
assert.ok(csv.startsWith('﻿Anunciante,'));
assert.ok(csv.includes(',+52 229 903 6290,'), 'phone numbers are not mistaken for formulas');
assert.ok(csv.includes(",'=cmd|x,"));
assert.ok(csv.includes('"Simón Bolivar No.339 Col. Ignacio Zaragoza, Veracruz, Mexico"'));
assert.ok(csv.includes('view_all_page_id=232733040158146'));

// --- Deleting a search keeps the advertisers database
await db.deleteSearch(s.id);
assert.equal((await db.listAdvertisers({})).total, n);
assert.equal((await db.listAdvertisers({searchId: s.id})).total, 0);
assert.equal((await db.stats()).searches, 0);

console.log('backend ok');
