// Pure mapping between Apify actor I/O and our records. No I/O here, so it is checkable offline.
import type {Contact, NewSearch, ScrapedAd} from './db.ts';

// Ads: curious_coder/facebook-ads-library-scraper. Contacts: saswave/facebook-company-page-scraper.
// Both were checked against the official Apify actors on the same pages: same emails, phones and
// addresses at a fraction of the price (Nov 2026, Free plan).
export const ADS_ACTOR = 'curious_coder~facebook-ads-library-scraper';
export const PAGES_ACTOR = 'saswave~facebook-company-page-scraper';
// Apify Free-plan list prices; the real cost is read back from each run.
export const PRICE_PER_AD = 0.00075;
export const PRICE_PER_PAGE = 0.004;
/** The ads actor refuses runs capped ("Maximum charged results") under 10, and there is one run per country. */
export const MIN_ADS_PER_RUN = 10;

const FB_URL = /^https:\/\/(www\.|m\.|web\.)?facebook\.com\//i;
export const isFacebookUrl = (s: string) => FB_URL.test(s.trim());

export const normUrl = (u: string) =>
  u.toLowerCase().replace(/^https?:\/\/(www\.|m\.|web\.)?/, '').replace(/[?#].*$/, '').replace(/\/+$/, '');

export type AdsQuery = NewSearch;

/** One Ads Library URL per country, or the pasted Facebook URL as-is. */
export function libraryUrls(s: Pick<AdsQuery, 'query' | 'countries' | 'active_status' | 'media_type' | 'exact' | 'newer_than'>): string[] {
  if (isFacebookUrl(s.query)) return [s.query.trim()];
  return s.countries.map(country => {
    const p = new URLSearchParams({
      active_status: s.active_status,
      ad_type: 'all',
      country,
      q: s.query,
      search_type: s.exact ? 'keyword_exact_phrase' : 'keyword_unordered',
      media_type: s.media_type,
    });
    // Same parameters the Ads Library date picker writes into its own URL.
    if (s.newer_than) {
      p.set('start_date[min]', s.newer_than);
      p.set('start_date[max]', '');
    }
    return `https://www.facebook.com/ads/library/?${p}`;
  });
}

/**
 * Input for one URL from libraryUrls(). The actor's per-URL limit is soft (it overshoots by up to
 * 30), so a run over several countries spends its whole cap on the first one: we start one run per
 * country and let `count`, the hard cap, hold each to its limit.
 */
export function adsActorInput(s: AdsQuery, url: string) {
  return {
    urls: [{url}],
    limitPerSource: s.results_limit,
    count: s.results_limit,
    scrapeAdDetails: false,
    // Only read when the query is a Facebook page URL rather than an Ads Library search.
    'scrapePageAds.activeStatus': s.active_status,
    'scrapePageAds.countryCode': 'ALL',
  };
}

export const pagesActorInput = (pages: {page_url: string}[]) => ({urls: pages.map(p => p.page_url), hours_details: false});

function countryOf(inputUrl: unknown): string {
  try {
    const c = new URL(String(inputUrl)).searchParams.get('country') ?? '';
    return /^[A-Z]{2}$/.test(c) ? c : '';
  } catch {
    return '';
  }
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const isoDate = (unix: unknown) => (typeof unix === 'number' && unix > 0 ? new Date(unix * 1000).toISOString() : null);

export function mapAd(item: any): ScrapedAd | null {
  const snap = item?.snapshot ?? {};
  const pageId = String(item?.page_id ?? snap.page_id ?? '');
  const adId = String(item?.ad_archive_id ?? item?.ad_id ?? '');
  if (!pageId || !adId) return null;
  const card = snap.cards?.[0] ?? {};
  const image = snap.images?.[0] ?? {};
  const video = snap.videos?.[0] ?? {};
  return {
    adId,
    pageId,
    pageName: str(item.page_name) || str(snap.page_name),
    pageUrl: str(snap.page_profile_uri) || `https://www.facebook.com/${pageId}`,
    profilePic: str(snap.page_profile_picture_url),
    category: str(snap.page_categories?.[0]),
    likes: typeof snap.page_like_count === 'number' ? snap.page_like_count : null,
    country: countryOf(item.url),
    body: str(snap.body?.text) || str(card.body),
    title: str(snap.title) || str(card.title),
    cta: str(snap.cta_text) || str(card.cta_text),
    linkUrl: str(snap.link_url) || str(card.link_url),
    imageUrl:
      str(image.original_image_url) || str(image.resized_image_url) || str(card.original_image_url) ||
      str(card.resized_image_url) || str(video.video_preview_image_url) || str(card.video_preview_image_url),
    videoUrl: str(video.video_hd_url) || str(video.video_sd_url) || str(card.video_hd_url) || str(card.video_sd_url),
    isActive: Boolean(item.is_active),
    startDate: isoDate(item.start_date),
    endDate: isoDate(item.end_date),
    platforms: Array.isArray(item.publisher_platform) ? item.publisher_platform : [],
    variants: Number(item.collation_count) || 1,
  };
}

// The contacts actor leaves some JSON escapes in its strings ("Medellín", "site.com\/path").
const unescape = (v: unknown) =>
  str(v).replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\\//g, '/').trim();
const withProtocol = (u: string) => (u && !/^https?:\/\//i.test(u) ? `https://${u}` : u);
const digits = (v: unknown) => (/^\d+$/.test(str(v)) ? Number(v) : null);

export function mapContact(p: any): Contact {
  const links: string[] = Array.isArray(p.external_urls) ? p.external_urls.map(unescape) : [];
  return {
    email: unescape(p.email),
    phone: unescape(p.phone),
    address: unescape(p.address),
    website: withProtocol(unescape(p.website)),
    instagram: links.find(l => /instagram\.com\//i.test(l)) ?? '',
    category: unescape(p.category_name),
    followers: digits(p.followers),
    rating: /^\d+%$/.test(str(p.recommendation)) ? parseInt(p.recommendation, 10) : null,
    pageCreated: '',
    profilePic: str(p.profile_image),
  };
}

/** Every key a contacts item can be matched by: its URLs and its page ID. */
export function contactKeys(p: any): string[] {
  return [
    ...[p.url, p.response_url].filter(Boolean).map((u: string) => normUrl(u)),
    ...[p.page_id].filter(Boolean).map(String),
  ];
}
