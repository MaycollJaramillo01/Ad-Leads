const COLUMNS: [string, string][] = [
  ['name', 'Anunciante'],
  ['email', 'Email'],
  ['phone', 'Teléfono'],
  ['address', 'Dirección'],
  ['website', 'Sitio web'],
  ['instagram', 'Instagram'],
  ['category', 'Categoría'],
  ['followers', 'Seguidores'],
  ['countries', 'Países'],
  ['ads_total', 'Anuncios'],
  ['ads_active', 'Anuncios activos'],
  ['status', 'Estado'],
  ['notes', 'Notas'],
  ['page_url', 'Página de Facebook'],
  ['page_created', 'Página creada'],
  ['ad_library', 'Ads Library'],
  ['first_seen', 'Visto por primera vez'],
  ['last_seen', 'Visto por última vez'],
];

export function cell(v: unknown): string {
  let s = v == null ? '' : Array.isArray(v) ? v.join(' ') : String(v);
  // Neutralize spreadsheet formulas in scraped text; keep phone numbers like "+1 978…" intact.
  if (/^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !/^[+-][\d\s().-]+$/.test(s))) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const adLibraryUrl = (pageId: string) =>
  `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=${pageId}`;

/** BOM-prefixed so Excel opens accents correctly. */
export function advertisersCsv(rows: Record<string, unknown>[]): string {
  const lines = [
    COLUMNS.map(([, h]) => h),
    ...rows.map(r => COLUMNS.map(([k]) => (k === 'ad_library' ? adLibraryUrl(String(r.page_id)) : r[k]))),
  ];
  return '﻿' + lines.map(l => l.map(cell).join(',')).join('\r\n');
}
