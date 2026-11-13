// Pure mapping between Apify actor I/O and our records. No I/O here, so it is checkable offline.
import type {Contact, NewSearch, ScrapedAd} from './db.ts';

const FB_URL = /^https:\/\/(www\.|m\.|web\.)?facebook\.com\//i;
export const isFacebookUrl = (s: string) => FB_URL.test(s.trim());

export const normUrl = (u: string) =>
  u.toLowerCase().replace(/^https?:\/\/(www\.|m\.|web\.)?/, '').replace(/[?#].*$/, '').replace(/\/+$/, '');

export type AdsQuery = NewSearch;

/** One Ads Library URL per country, or the pasted Facebook URL as-is. */
export function libraryUrls(s: Pick<AdsQuery, 'query' | 'countries' | 'active_status' | 'media_type' | 'exact'>): string[] {
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
    return `https://www.facebook.com/ads/library/?${p}`;
  });
}

export function adsActorInput(s: AdsQuery) {
  return {
    startUrls: libraryUrls(s).map(url => ({url})),
    resultsLimit: s.results_limit,
    ...(s.newer_than ? {onlyAdsNewerThan: s.newer_than} : {}),
  };
}

function countryOf(inputUrl: unknown): string {
  try {
    const c = new URL(String(inputUrl)).searchParams.get('country') ?? '';
    return /^[A-Z]{2}$/.test(c) ? c : '';
  } catch {
    return '';
  }
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function mapAd(item: any): ScrapedAd | null {
  const snap = item?.snapshot ?? {};
  const pageId = String(item?.pageId ?? item?.pageID ?? snap.pageId ?? '');
  const adId = String(item?.adArchiveID ?? item?.adArchiveId ?? '');
  if (!pageId || !adId) return null;
  const card = snap.cards?.[0] ?? {};
  const image = snap.images?.[0] ?? {};
  const video = snap.videos?.[0] ?? {};
  return {
    adId,
    pageId,
    pageName: str(item.pageName) || str(snap.pageName),
    pageUrl: str(snap.pageProfileUri) || `https://www.facebook.com/${pageId}`,
    profilePic: str(snap.pageProfilePictureUrl),
    category: str(snap.pageCategories?.[0]),
    likes: typeof snap.pageLikeCount === 'number' ? snap.pageLikeCount : null,
    country: countryOf(item.inputUrl),
    body: str(snap.body?.text) || str(card.body),
    title: str(snap.title) || str(card.title),
    cta: str(snap.ctaText) || str(card.ctaText),
    linkUrl: str(snap.linkUrl) || str(card.linkUrl),
    imageUrl:
      str(image.originalImageUrl) || str(image.resizedImageUrl) || str(card.originalImageUrl) ||
      str(card.resizedImageUrl) || str(video.videoPreviewImageUrl) || str(card.videoPreviewImageUrl),
    videoUrl: str(video.videoHdUrl) || str(video.videoSdUrl) || str(card.videoHdUrl) || str(card.videoSdUrl),
    isActive: Boolean(item.isActive),
    startDate: str(item.startDateFormatted) || null,
    endDate: str(item.endDateFormatted) || null,
    platforms: Array.isArray(item.publisherPlatform) ? item.publisherPlatform : [],
    variants: Number(item.collationCount) || 1,
  };
}

export function mapContact(p: any): Contact {
  return {
    email: str(p.email),
    phone: str(p.phone),
    address: str(p.address),
    website: str(p.website),
    instagram: str(p.instagram?.[0]?.url) || str(p.alternativeSocialMedia),
    category: str(p.category),
    followers: typeof p.followers === 'number' ? p.followers : null,
    rating: typeof p.ratingOverall === 'number' ? p.ratingOverall : null,
    pageCreated: str(p.creation_date),
    profilePic: str(p.profilePictureUrl),
  };
}

/** Every key a pages-scraper item can be matched by: its URLs and its IDs. */
export function contactKeys(p: any): string[] {
  return [
    ...[p.facebookUrl, p.pageUrl, p.url, p.inputUrl].filter(Boolean).map((u: string) => normUrl(u)),
    ...[p.facebookId, p.pageId, p.pageAdLibrary?.id].filter(Boolean).map(String),
  ];
}

// Apify list prices on the Free plan; real cost is read back from each run.
export const PRICE_PER_AD = 0.0058;
export const PRICE_PER_PAGE = 0.012;
