import {useEffect, useRef} from 'react';

// ============= TYPES (mirror src/lib/db.ts rows as JSON) =============

export type SearchStatus = 'queued' | 'ads' | 'pages' | 'done' | 'error' | 'cancelled';
export type LeadStatus = 'nuevo' | 'contactado' | 'interesado' | 'cliente' | 'descartado';

export interface Search extends Record<string, unknown> {
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

export interface Advertiser extends Record<string, unknown> {
  page_id: string;
  name: string;
  page_url: string;
  profile_pic: string;
  category: string;
  likes: number | null;
  email: string;
  phone: string;
  address: string;
  website: string;
  instagram: string;
  followers: number | null;
  rating: number | null;
  page_created: string;
  enriched_at: string | null;
  status: LeadStatus;
  notes: string;
  first_seen: string;
  last_seen: string;
  ads_total: number;
  ads_active: number;
  countries: string[];
}

export interface Ad {
  ad_id: string;
  country: string;
  body: string;
  title: string;
  cta: string;
  link_url: string;
  image_url: string;
  video_url: string;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  platforms: string[];
  variants: number;
}

export interface AdvertiserDetail extends Advertiser {
  ads: Ad[];
  searches: {id: number; query: string; countries: string[]; created_at: string; ads_count: number}[];
}

export interface Stats {
  advertisers: number;
  withEmail: number;
  withPhone: number;
  withAddress: number;
  ads: number;
  searches: number;
  running: number;
  costUsd: number;
  byStatus: {status: LeadStatus; n: number}[];
  topCountries: {country: string; n: number}[];
}

// ============= FETCH =============

export async function api<T>(url: string, init?: {method?: string; body?: unknown}): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? 'GET',
    headers: init?.body ? {'Content-Type': 'application/json'} : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({error: `Error ${res.status}`}));
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
  return data as T;
}

/** Calls fn now and every `ms` while `enabled`; always uses the latest fn. */
export function usePolling(fn: () => void, ms: number, enabled: boolean) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => ref.current(), ms);
    return () => clearInterval(t);
  }, [ms, enabled]);
}

// ============= COUNTRIES =============

// Every country the Meta Ad Library can be filtered by (ISO 3166-1 alpha-2).
const CODES =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW'.split(' ');

const regionNames = new Intl.DisplayNames(['es'], {type: 'region'});
export const countryName = (code: string) => {
  if (code === 'ALL') return 'Todos los países';
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
};

// No flag emoji: Windows renders them as bare letter pairs.
export const COUNTRY_OPTIONS = CODES.map(c => ({value: c, label: countryName(c)})).sort((a, b) =>
  a.label.localeCompare(b.label, 'es'),
);

export const REGIONS: {label: string; codes: string[]}[] = [
  {label: 'Latinoamérica', codes: 'MX GT SV HN NI CR PA CU DO PR CO VE EC PE BO CL AR UY PY BR'.split(' ')},
  {label: 'Habla hispana', codes: 'ES MX GT SV HN NI CR PA CU DO PR CO VE EC PE BO CL AR UY PY'.split(' ')},
  {label: 'Norteamérica', codes: ['US', 'CA', 'MX']},
  {label: 'Habla inglesa', codes: ['US', 'GB', 'CA', 'AU', 'NZ', 'IE']},
  {label: 'Europa', codes: 'ES PT FR IT DE NL BE IE GB AT CH SE NO DK FI PL CZ GR RO HU'.split(' ')},
];

export function countriesLabel(codes: string[], max = 3): string {
  if (codes.length === 0) return '—';
  if (codes[0] === 'ALL') return 'Todos los países';
  if (codes.length === 1) return countryName(codes[0]);
  const shown = codes.slice(0, max).join(', ');
  return codes.length > max ? `${shown} +${codes.length - max}` : shown;
}

// ============= LABELS =============

export const SEARCH_STATUS: Record<SearchStatus, {label: string; variant: 'neutral' | 'info' | 'success' | 'warning' | 'error'}> = {
  queued: {label: 'En cola', variant: 'neutral'},
  ads: {label: 'Buscando anuncios', variant: 'info'},
  pages: {label: 'Extrayendo contactos', variant: 'info'},
  done: {label: 'Completada', variant: 'success'},
  error: {label: 'Error', variant: 'error'},
  cancelled: {label: 'Cancelada', variant: 'warning'},
};
export const isRunning = (s: {status: SearchStatus}) => s.status === 'queued' || s.status === 'ads' || s.status === 'pages';

export const LEAD_STATUS: Record<LeadStatus, {label: string; variant: 'blue' | 'yellow' | 'purple' | 'green' | 'neutral'}> = {
  nuevo: {label: 'Nuevo', variant: 'blue'},
  contactado: {label: 'Contactado', variant: 'yellow'},
  interesado: {label: 'Interesado', variant: 'purple'},
  cliente: {label: 'Cliente', variant: 'green'},
  descartado: {label: 'Descartado', variant: 'neutral'},
};
export const LEAD_STATUS_OPTIONS = (Object.keys(LEAD_STATUS) as LeadStatus[]).map(k => ({value: k, label: LEAD_STATUS[k].label}));

export const ACTIVE_STATUS_LABEL: Record<string, string> = {active: 'Activos', inactive: 'Inactivos', all: 'Activos e inactivos'};
export const MEDIA_OPTIONS = [
  {value: 'all', label: 'Todos los formatos'},
  {value: 'image', label: 'Imagen'},
  {value: 'video', label: 'Video'},
  {value: 'meme', label: 'Meme'},
  {value: 'none', label: 'Sin imagen ni video'},
];

// ============= FORMAT =============

export const num = new Intl.NumberFormat('es');
export const usd = (n: number) =>
  new Intl.NumberFormat('es', {style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 3 : 2}).format(n);
export const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : '—');
export const shortUrl = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

export function duration(fromIso: string, toIso: string | null): string {
  const s = Math.max(0, Math.round(((toIso ? Date.parse(toIso) : Date.now()) - Date.parse(fromIso)) / 1000));
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : m > 0 ? `${m} min ${s % 60} s` : `${s} s`;
}

// Apify Free-plan list prices; the real cost comes back from each run.
export const PRICE_PER_AD = 0.0058;
export const PRICE_PER_PAGE = 0.012;
