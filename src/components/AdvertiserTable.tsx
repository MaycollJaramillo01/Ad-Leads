import {useEffect, useMemo, useState} from 'react';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Icon} from '@astryxdesign/core/Icon';
import {HStack, StackItem, VStack} from '@astryxdesign/core/Layout';
import {Link} from '@astryxdesign/core/Link';
import {MultiSelector} from '@astryxdesign/core/MultiSelector';
import {Pagination} from '@astryxdesign/core/Pagination';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {Selector} from '@astryxdesign/core/Selector';
import {Table, pixel, proportional, useTableSelection, useTableSortable} from '@astryxdesign/core/Table';
import type {TableColumn, TableSortState} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Timestamp} from '@astryxdesign/core/Timestamp';
import {ArrowDownTrayIcon, MagnifyingGlassIcon, UsersIcon} from '@heroicons/react/24/outline';

import {AdvertiserDrawer, LEAD_BADGE} from './AdvertiserDrawer';
import {
  COUNTRY_OPTIONS, CREATED_OPTIONS, LEAD_STATUS_OPTIONS, api, contactFromChecks, num, shortUrl, type Advertiser, type LeadStatus, type Search,
} from './shared';

// 'any' and 'none' only arrive from links saved before the checkboxes; they still filter.
type Contact = 'all' | 'email' | 'phone' | 'both' | 'any' | 'none';

interface Filters {
  q: string;
  status: string;
  countries: string[];
  contact: Contact;
  /** Page created in the last N days; '' = any date. */
  created: string;
  search: string;
  sort: string;
  dir: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

const DEFAULT_FILTERS: Filters = {
  q: '', status: '', countries: [], contact: 'all', created: '', search: '', sort: 'ads', dir: 'desc', page: 1, pageSize: 50,
};

function readUrl(): Filters {
  const p = new URLSearchParams(location.search);
  return {
    q: p.get('q') ?? '',
    status: p.get('status') ?? '',
    countries: (p.get('countries') ?? '').split(',').filter(Boolean),
    contact: (p.get('contact') as Contact) || 'all',
    created: p.get('created') ?? '',
    search: p.get('search') ?? '',
    sort: p.get('sort') ?? DEFAULT_FILTERS.sort,
    dir: p.get('dir') === 'asc' ? 'asc' : 'desc',
    page: Number(p.get('page')) || 1,
    pageSize: Number(p.get('pageSize')) || DEFAULT_FILTERS.pageSize,
  };
}

/** Only non-default values, so URLs stay short and shareable. */
function toQuery(f: Filters, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.status) p.set('status', f.status);
  if (f.countries.length) p.set('countries', f.countries.join(','));
  if (f.contact !== 'all') p.set('contact', f.contact);
  if (f.created) p.set('created', f.created);
  if (f.search) p.set('search', f.search);
  if (f.sort !== DEFAULT_FILTERS.sort) p.set('sort', f.sort);
  if (f.dir !== DEFAULT_FILTERS.dir) p.set('dir', f.dir);
  if (f.page > 1) p.set('page', String(f.page));
  if (f.pageSize !== DEFAULT_FILTERS.pageSize) p.set('pageSize', String(f.pageSize));
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return p.toString();
}

const SORT_KEY: Record<string, string> = {
  name: 'name', status: 'status', email: 'email', phone: 'phone', address: 'address', ads_total: 'ads', last_seen: 'last_seen',
  page_created: 'page_created',
};

export function AdvertiserTable({
  searchId,
  createdDays,
  searches,
  exportName,
  refreshKey = 0,
  isLive,
  defaultSort,
}: {
  /** Fixed scope (search detail page). */
  searchId?: number;
  /** Fixed scope: only pages created in the last N days ("Páginas nuevas"). */
  createdDays?: number;
  /** Starting sort when the URL has none, e.g. newest pages first. */
  defaultSort?: {sort: string; dir: 'asc' | 'desc'};
  /** When given, shows a "found in search" filter. */
  searches?: Search[];
  exportName: string;
  refreshKey?: number;
  /** Rows are still arriving: show a hint instead of an empty state. */
  isLive?: boolean;
}) {
  const [f, setF] = useState<Filters>(() => {
    const fromUrl = readUrl();
    const hasSort = new URLSearchParams(location.search).has('sort');
    return {...DEFAULT_FILTERS, ...fromUrl, ...(defaultSort && !hasSort ? defaultSort : {})};
  });
  const [debouncedQ, setDebouncedQ] = useState(f.q);
  const [data, setData] = useState<{items: Advertiser[]; total: number} | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(() => new URLSearchParams(location.search).get('anunciante'));
  const [reload, setReload] = useState(0);

  const set = (patch: Partial<Filters>) => setF(prev => ({...prev, page: 1, ...patch}));

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(f.q), 300);
    return () => clearTimeout(t);
  }, [f.q]);

  const scoped = {
    ...f,
    q: debouncedQ,
    search: searchId ? String(searchId) : f.search,
    created: createdDays ? String(createdDays) : f.created,
  };
  const query = toQuery(scoped);

  // URL mirrors the filters (and the open record) so a view can be bookmarked or shared.
  useEffect(() => {
    const own = toQuery({...f, search: searchId ? '' : f.search, created: createdDays ? '' : f.created}, openId ? {anunciante: openId} : {});
    history.replaceState(null, '', own ? `?${own}` : location.pathname);
  }, [f, openId, searchId, createdDays]);

  const wantsEmail = f.contact === 'email' || f.contact === 'both';
  const wantsPhone = f.contact === 'phone' || f.contact === 'both';
  const setContact = (email: boolean, phone: boolean) => set({contact: contactFromChecks(email, phone) || 'all'});

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    api<{items: Advertiser[]; total: number}>(`/api/advertisers?${query}`)
      .then(r => {
        if (cancelled) return;
        setData(r);
        setError(null);
      })
      .catch(e => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [query, refreshKey, reload]);

  const items = data?.items ?? [];

  // ---- sorting (server side) ----
  const sort: TableSortState = [{sortKey: Object.keys(SORT_KEY).find(k => SORT_KEY[k] === f.sort) ?? 'ads_total', direction: f.dir === 'asc' ? 'ascending' : 'descending'}];
  const sortPlugin = useTableSortable<Advertiser>({
    sort,
    onSortChange: next => {
      const e = next[0];
      if (e) set({sort: SORT_KEY[e.sortKey] ?? 'ads', dir: e.direction === 'ascending' ? 'asc' : 'desc'});
    },
  });

  // ---- selection (persists across pages) ----
  const pageIds = items.map(i => i.page_id);
  const allOnPage = pageIds.length > 0 && pageIds.every(id => selected.has(id));
  const someOnPage = pageIds.some(id => selected.has(id));
  const selectionPlugin = useTableSelection<Advertiser>({
    getIsItemSelected: item => selected.has(item.page_id),
    onSelectItem: ({item, isSelected}) =>
      setSelected(prev => {
        const next = new Set(prev);
        isSelected ? next.add(item.page_id) : next.delete(item.page_id);
        return next;
      }),
    getIsAllSelected: () => allOnPage,
    getIsIndeterminate: () => someOnPage && !allOnPage,
    onSelectAll: ({isAllSelected}) =>
      setSelected(prev => {
        const next = new Set(prev);
        for (const id of pageIds) isAllSelected ? next.add(id) : next.delete(id);
        return next;
      }),
    getRowLabel: item => item.name,
    hasRowHighlight: true,
  });

  async function bulkStatus(status: LeadStatus) {
    try {
      await api('/api/advertisers', {method: 'PATCH', body: {ids: [...selected], status}});
      setSelected(new Set());
      setReload(r => r + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const open = (id: string) => setOpenId(id);

  const columns: TableColumn<Advertiser>[] = useMemo(
    () => [
      {
        key: 'name',
        header: 'Anunciante',
        width: proportional(2.2),
        sortable: true,
        renderCell: a => (
          <HStack gap={2} vAlign="center">
            <Avatar src={a.profile_pic || undefined} name={a.name} size="sm" tooltip={false} />
            <StackItem size="fill">
              <VStack gap={0}>
                <Text maxLines={1} weight="medium">
                  <Link
                    href={`?anunciante=${a.page_id}`}
                    onClick={e => {
                      e.preventDefault();
                      open(a.page_id);
                    }}>
                    {a.name || 'Sin nombre'}
                  </Link>
                </Text>
                <Text type="supporting" maxLines={1}>
                  {a.category || shortUrl(a.page_url)}
                </Text>
              </VStack>
            </StackItem>
          </HStack>
        ),
      },
      {key: 'status', header: 'Estado', width: pixel(124), sortable: true, renderCell: a => LEAD_BADGE(a.status)},
      {
        key: 'email',
        header: 'Email',
        width: proportional(2),
        sortable: true,
        renderCell: a =>
          a.email ? (
            <Text maxLines={1}>
              <Link href={`mailto:${a.email}`}>{a.email}</Link>
            </Text>
          ) : (
            <Text color="disabled">{a.enriched_at ? '—' : 'Sin extraer'}</Text>
          ),
      },
      {
        key: 'phone',
        header: 'Teléfono',
        width: pixel(150),
        sortable: true,
        renderCell: a =>
          a.phone ? (
            <Text maxLines={1}>
              <Link href={`tel:${a.phone.replace(/[^\d+]/g, '')}`}>{a.phone}</Link>
            </Text>
          ) : (
            <Text color="disabled">—</Text>
          ),
      },
      {
        key: 'address',
        header: 'Dirección',
        width: proportional(2),
        sortable: true,
        renderCell: a => (a.address ? <Text maxLines={1}>{a.address}</Text> : <Text color="disabled">—</Text>),
      },
      {
        key: 'countries',
        header: 'Países',
        width: pixel(96),
        renderCell: a => (
          <Text maxLines={1} type="supporting">
            {a.countries.join(', ') || '—'}
          </Text>
        ),
      },
      {
        key: 'ads_total',
        header: 'Anuncios',
        width: pixel(100),
        align: 'end',
        sortable: true,
        renderCell: a => (
          <VStack gap={0}>
            <Text hasTabularNumbers justify="end" display="block">
              {num.format(a.ads_total)}
            </Text>
            <Text type="supporting" justify="end" display="block">{`${num.format(a.ads_active)} activos`}</Text>
          </VStack>
        ),
      },
      {
        key: 'page_created',
        header: 'Página creada',
        width: pixel(130),
        sortable: true,
        renderCell: a =>
          a.page_created ? <Timestamp value={`${a.page_created}T12:00:00Z`} format="date" /> : <Text color="disabled">—</Text>,
      },
      {key: 'last_seen', header: 'Visto', width: pixel(110), sortable: true, renderCell: a => <Timestamp value={a.last_seen} format="relative" />},
    ],
    [],
  );

  const activeFilters =
    (f.q ? 1 : 0) + (f.status ? 1 : 0) + (f.countries.length ? 1 : 0) + (f.contact !== 'all' ? 1 : 0) + (!createdDays && f.created ? 1 : 0) +
    (!searchId && f.search ? 1 : 0);
  const clear = () => setF(prev => ({...DEFAULT_FILTERS, sort: prev.sort, dir: prev.dir, pageSize: prev.pageSize}));  const exportHref = `/api/export?${toQuery(scoped, {filename: exportName})}`;
  const exportSelectedHref = `/api/export?${new URLSearchParams({ids: [...selected].join(','), filename: `${exportName}-seleccion`})}`;

  return (
    <VStack gap={4}>
      {/* ---- filters ---- */}
      <HStack gap={3} vAlign="end" wrap="wrap">
        <VStack width={260}>
          <TextInput
            label="Buscar"
            value={f.q}
            onChange={q => set({q})}
            placeholder="Nombre, email, ciudad, notas…"
            startIcon={MagnifyingGlassIcon}
            hasClear
          />
        </VStack>
        <VStack gap={1}>
          <Text type="supporting" weight="medium">
            Con contacto
          </Text>
          <HStack gap={4} vAlign="center">
            <CheckboxInput label="Correo" value={wantsEmail} onChange={v => setContact(v, wantsPhone)} />
            <CheckboxInput label="Teléfono" value={wantsPhone} onChange={v => setContact(wantsEmail, v)} />
          </HStack>
        </VStack>
        {!createdDays && (
          <Selector
            label="Página creada"
            options={CREATED_OPTIONS}
            value={f.created}
            onChange={v => set({created: v ?? ''})}
            width={170}
          />
        )}
        <Selector
          label="Estado"
          options={[{value: '', label: 'Todos los estados'}, ...LEAD_STATUS_OPTIONS]}
          value={f.status}
          onChange={v => set({status: v ?? ''})}
          width={180}
        />
        <MultiSelector
          label="Países"
          options={COUNTRY_OPTIONS}
          value={f.countries}
          onChange={countries => set({countries})}
          hasSearch
          searchPlaceholder="Buscar país…"
          placeholder="Todos"
          formatValue={sel => (sel.length <= 2 ? sel.map(s => s.value).join(', ') : `${sel.length} países`)}
          width={170}
        />
        {searches && (
          <Selector
            label="Búsqueda"
            options={[{value: '', label: 'Todas las búsquedas'}, ...searches.map(s => ({value: String(s.id), label: `#${s.id} · ${s.query}`}))]}
            value={f.search}
            onChange={v => set({search: v ?? ''})}
            hasSearch
            width={220}
          />
        )}
        <StackItem size="fill" />
        {activeFilters > 0 && <Button label={`Quitar filtros (${activeFilters})`} variant="ghost" onClick={clear} />}
        <Button
          label={`Exportar CSV (${num.format(data?.total ?? 0)})`}
          icon={<Icon icon={ArrowDownTrayIcon} />}
          href={exportHref}
          isDisabled={!data?.total}
        />
      </HStack>

      {/* ---- bulk actions ---- */}
      {selected.size > 0 && (
        <Card padding={3} variant="muted">
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Text weight="semibold">{`${num.format(selected.size)} seleccionado(s)`}</Text>
            <Selector
              label="Cambiar estado de la selección"
              isLabelHidden
              placeholder="Cambiar estado a…"
              options={LEAD_STATUS_OPTIONS}
              value=""
              onChange={v => v && bulkStatus(v as LeadStatus)}
              width={200}
              size="sm"
            />
            <Button label="Exportar selección" size="sm" icon={<Icon icon={ArrowDownTrayIcon} />} href={exportSelectedHref} />
            <StackItem size="fill" />
            <Button label="Quitar selección" size="sm" variant="ghost" onClick={() => setSelected(new Set())} />
          </HStack>
        </Card>
      )}

      {error && <Banner status="error" title="No se pudieron cargar los anunciantes" description={error} endContent={<Button label="Reintentar" onClick={() => setReload(r => r + 1)} />} />}

      {/* ---- table ---- */}
      {isLoading && <ProgressBar label="Cargando anunciantes" isLabelHidden isIndeterminate />}
      {data && data.total === 0 ? (
        activeFilters > 0 ? (
          <EmptyState title="Ningún anunciante coincide con los filtros" actions={<Button label="Quitar filtros" onClick={clear} />} />
        ) : (
          <EmptyState
            icon={<Icon icon={UsersIcon} size="lg" />}
            title={
              isLive ? 'Los anunciantes aparecerán aquí en cuanto termine el paso 1'
              : createdDays ? `Ninguna página de tus anunciantes se creó en los últimos ${createdDays} días`
              : 'No hay anunciantes todavía'
            }
            description={
              isLive ? undefined
              : createdDays
                ? 'Solo se conocen las fechas de las búsquedas hechas con "Fecha de creación de la página" activado.'
                : 'Lanza una búsqueda: cada anunciante encontrado se guarda aquí automáticamente.'
            }
            actions={isLive ? undefined : <Button label="Nueva búsqueda" variant="primary" href="/" />}
          />
        )
      ) : (
        data && (
          <>
            <Table<Advertiser>
              data={items}
              columns={columns}
              idKey="page_id"
              density="balanced"
              hasHover
              textOverflow="truncate"
              plugins={{selection: selectionPlugin, sort: sortPlugin}}
            />
            <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
              <Text type="supporting">
                {`${num.format((f.page - 1) * f.pageSize + 1)}–${num.format(Math.min(f.page * f.pageSize, data.total))} de ${num.format(data.total)} anunciantes`}
              </Text>
              <Pagination
                page={f.page}
                onChange={page => setF(prev => ({...prev, page}))}
                totalItems={data.total}
                pageSize={f.pageSize}
                pageSizeOptions={[25, 50, 100, 200]}
                onPageSizeChange={pageSize => set({pageSize})}
                label="Páginas de anunciantes"
              />
            </HStack>
          </>
        )
      )}

      <AdvertiserDrawer pageId={openId} onClose={() => setOpenId(null)} onChanged={() => setReload(r => r + 1)} />
    </VStack>
  );
}
