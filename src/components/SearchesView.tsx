import {useEffect, useMemo, useState} from 'react';
import {AlertDialog} from '@astryxdesign/core/AlertDialog';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Icon} from '@astryxdesign/core/Icon';
import {HStack, Layout, LayoutContent, StackItem, VStack} from '@astryxdesign/core/Layout';
import {Link} from '@astryxdesign/core/Link';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import {Table, pixel, proportional, useTableSortable, useTableSortableState} from '@astryxdesign/core/Table';
import type {TableColumn, TableSortComparator} from '@astryxdesign/core/Table';
import {Heading, Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Timestamp} from '@astryxdesign/core/Timestamp';
import {ArrowDownTrayIcon, ArrowPathIcon, ClockIcon, MagnifyingGlassIcon, PlusIcon, TrashIcon} from '@heroicons/react/24/outline';

import {SearchProgress, SearchStatusBadge} from './SearchBits';
import {api, contactFromChecks, countriesLabel, isRunning, num, pct, usePolling, usd, type Search} from './shared';

type Scope = 'all' | 'running' | 'done' | 'failed';

/** CSV of one past search's advertisers, optionally only those with email and/or phone. */
const CONTACT_SUFFIX: Record<string, string> = {email: '-con-correo', phone: '-con-telefono', both: '-con-correo-y-telefono'};

function exportHref(s: Search, contact: string) {
  const p = new URLSearchParams({search: String(s.id), filename: `busqueda-${s.id}-${s.query.slice(0, 30)}${CONTACT_SUFFIX[contact] ?? ''}`});
  if (contact) p.set('contact', contact);
  return `/api/export?${p}`;
}

export function SearchesView() {
  const [searches, setSearches] = useState<Search[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>('all');
  const [q, setQ] = useState('');
  const [toDelete, setToDelete] = useState<Search | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [withEmail, setWithEmail] = useState(false);
  const [withPhone, setWithPhone] = useState(false);
  const contact = contactFromChecks(withEmail, withPhone);
  const contactLabel = contact === 'both' ? ' con correo y teléfono' : contact === 'email' ? ' con correo' : contact === 'phone' ? ' con teléfono' : '';

  const load = () =>
    api<{searches: Search[]}>('/api/searches?limit=500')
      .then(r => {
        setSearches(r.searches);
        setError(null);
      })
      .catch(e => setError((e as Error).message));
  useEffect(() => {
    load();
  }, []);
  usePolling(load, 3000, searches?.some(isRunning) ?? false);

  async function remove(s: Search) {
    setIsDeleting(true);
    try {
      await api(`/api/searches/${s.id}`, {method: 'DELETE'});
      setToDelete(null);
      load();
    } catch (e) {
      setError((e as Error).message);
      setToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  }

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (searches ?? []).filter(
      s =>
        (scope === 'all' ||
          (scope === 'running' && isRunning(s)) ||
          (scope === 'done' && s.status === 'done') ||
          (scope === 'failed' && (s.status === 'error' || s.status === 'cancelled'))) &&
        (term === '' || s.query.toLowerCase().includes(term)),
    );
  }, [searches, scope, q]);

  const columns: TableColumn<Search>[] = [
    {
      key: 'query',
      header: 'Búsqueda',
      width: proportional(3),
      sortable: true,
      renderCell: s => (
        <VStack gap={1}>
          <Text maxLines={1} weight="medium">
            <Link href={`/busquedas/${s.id}`}>{s.query}</Link>
          </Text>
          {isRunning(s) ? <SearchProgress search={s} isCompact /> : <Text type="supporting">{countriesLabel(s.countries, 4)}</Text>}
        </VStack>
      ),
    },
    {key: 'status', header: 'Estado', width: pixel(170), sortable: true, renderCell: s => <SearchStatusBadge search={s} />},
    {
      key: 'ads_count',
      header: 'Anuncios',
      width: pixel(96),
      align: 'end',
      sortable: true,
      renderCell: s => <Text hasTabularNumbers>{num.format(s.ads_count)}</Text>,
    },
    {
      key: 'advertisers_count',
      header: 'Anunciantes',
      width: pixel(112),
      align: 'end',
      sortable: true,
      renderCell: s => <Text hasTabularNumbers>{num.format(s.advertisers_count)}</Text>,
    },
    {
      key: 'with_email',
      header: 'Con email',
      width: pixel(112),
      align: 'end',
      sortable: true,
      renderCell: s => (
        <VStack gap={0}>
          <Text hasTabularNumbers justify="end" display="block">
            {num.format(s.with_email)}
          </Text>
          <Text type="supporting" justify="end" display="block">
            {pct(s.with_email, s.advertisers_count)}
          </Text>
        </VStack>
      ),
    },
    {key: 'cost_usd', header: 'Costo', width: pixel(108), align: 'end', sortable: true, renderCell: s => <Text hasTabularNumbers>{usd(s.cost_usd)}</Text>},
    {key: 'created_at', header: 'Fecha', width: pixel(130), sortable: true, renderCell: s => <Timestamp value={s.created_at} format="auto" />},
    {
      key: 'actions',
      header: 'Acciones',
      width: pixel(132),
      align: 'end',
      renderCell: s => (
        <HStack gap={1} hAlign="end">
          <Button
            label={`Descargar CSV${contactLabel}`}
            isIconOnly
            variant="ghost"
            size="sm"
            icon={<Icon icon={ArrowDownTrayIcon} />}
            href={exportHref(s, contact)}
            isDisabled={s.advertisers_count === 0}
            tooltip={s.advertisers_count === 0 ? 'Sin anunciantes' : `Descargar CSV${contactLabel}`}
          />
          <Button label="Repetir búsqueda" isIconOnly variant="ghost" size="sm" icon={<Icon icon={ArrowPathIcon} />} href={`/?repetir=${s.id}`} tooltip="Repetir" />
          <Button
            label="Borrar búsqueda"
            isIconOnly
            variant="ghost"
            size="sm"
            icon={<Icon icon={TrashIcon} />}
            onClick={() => setToDelete(s)}
            isDisabled={isRunning(s)}
            tooltip={isRunning(s) ? 'Cancélala antes de borrarla' : 'Borrar'}
          />
        </HStack>
      ),
    },
  ];

  const COMPARATORS: Partial<Record<string, TableSortComparator<Search>>> = {
    query: (a, b) => a.query.localeCompare(b.query, 'es'),
    status: (a, b) => a.status.localeCompare(b.status),
    ads_count: (a, b) => a.ads_count - b.ads_count,
    advertisers_count: (a, b) => a.advertisers_count - b.advertisers_count,
    with_email: (a, b) => a.with_email - b.with_email,
    cost_usd: (a, b) => a.cost_usd - b.cost_usd,
    created_at: (a, b) => a.created_at.localeCompare(b.created_at),
  };
  const {sortedData, sortConfig} = useTableSortableState<Search>({data: visible, comparators: COMPARATORS});
  const sortPlugin = useTableSortable<Search>(sortConfig);

  const counts = {
    running: searches?.filter(isRunning).length ?? 0,
    done: searches?.filter(s => s.status === 'done').length ?? 0,
    failed: searches?.filter(s => s.status === 'error' || s.status === 'cancelled').length ?? 0,
  };

  return (
    <Layout
      height="fill"
      contentWidth={1280}
      content={
        <LayoutContent padding={6}>
          <VStack gap={6}>
            <HStack gap={3} vAlign="center" wrap="wrap">
              <StackItem size="fill">
                <VStack gap={1}>
                  <Heading level={1}>Historial de búsquedas</Heading>
                  <Text color="secondary">Las búsquedas siguen en segundo plano aunque cierres esta página.</Text>
                </VStack>
              </StackItem>
              <Button label="Nueva búsqueda" variant="primary" icon={<Icon icon={PlusIcon} />} href="/" />
            </HStack>

            {error && <Banner status="error" title="No se pudo cargar el historial" description={error} endContent={<Button label="Reintentar" onClick={load} />} />}

            <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
              <SegmentedControl label="Filtrar por estado" value={scope} onChange={v => setScope(v as Scope)}>
                <SegmentedControlItem value="all" label={`Todas (${searches?.length ?? 0})`} />
                <SegmentedControlItem value="running" label={`En curso (${counts.running})`} />
                <SegmentedControlItem value="done" label={`Completadas (${counts.done})`} />
                <SegmentedControlItem value="failed" label={`Con error (${counts.failed})`} />
              </SegmentedControl>
              <VStack width={280}>
                <TextInput label="Buscar en el historial" isLabelHidden value={q} onChange={setQ} placeholder="Buscar palabra clave…" startIcon={MagnifyingGlassIcon} hasClear />
              </VStack>
            </HStack>

            <HStack gap={4} vAlign="center" wrap="wrap">
              <Text type="supporting" weight="medium">
                Al descargar, incluir solo anunciantes con:
              </Text>
              <CheckboxInput label="Correo" value={withEmail} onChange={setWithEmail} size="sm" />
              <CheckboxInput label="Teléfono" value={withPhone} onChange={setWithPhone} size="sm" />
              <Text type="supporting">{contact ? 'Si marcas los dos, se exigen ambos.' : 'Sin marcar: todos los anunciantes de la búsqueda.'}</Text>
            </HStack>

            {searches && searches.length === 0 ? (
              <EmptyState
                icon={<Icon icon={ClockIcon} size="lg" />}
                title="Todavía no hay búsquedas"
                description="Lanza tu primera búsqueda y aparecerá aquí con su progreso, resultados y costo."
                actions={<Button label="Nueva búsqueda" variant="primary" href="/" />}
              />
            ) : searches && visible.length === 0 ? (
              <EmptyState
                title="Ninguna búsqueda coincide"
                actions={
                  <Button
                    label="Quitar filtros"
                    onClick={() => {
                      setScope('all');
                      setQ('');
                    }}
                  />
                }
              />
            ) : (
              <Table<Search>
                data={sortedData}
                columns={columns}
                idKey="id"
                density="balanced"
                hasHover
                verticalAlign="top"
                plugins={{sort: sortPlugin}}
              />
            )}
            <AlertDialog
              isOpen={toDelete != null}
              onOpenChange={open => !open && setToDelete(null)}
              title={`¿Borrar la búsqueda "${toDelete?.query ?? ''}"?`}
              description="Se borra del historial. Los anunciantes que encontró se quedan en tu base de datos."
              actionLabel="Borrar búsqueda"
              cancelLabel="Cancelar"
              onAction={() => toDelete && remove(toDelete)}
              isActionLoading={isDeleting}
            />
          </VStack>
        </LayoutContent>
      }
    />
  );
}
