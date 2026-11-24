import {useEffect, useRef, useState} from 'react';
import {AlertDialog} from '@astryxdesign/core/AlertDialog';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Grid} from '@astryxdesign/core/Grid';
import {Icon} from '@astryxdesign/core/Icon';
import {HStack, Layout, LayoutContent, StackItem, VStack} from '@astryxdesign/core/Layout';
import {Link} from '@astryxdesign/core/Link';
import {MetadataList, MetadataListItem} from '@astryxdesign/core/MetadataList';
import {Spinner} from '@astryxdesign/core/Spinner';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Timestamp} from '@astryxdesign/core/Timestamp';
import {ArrowLeftIcon, ArrowPathIcon, StopIcon, TrashIcon} from '@heroicons/react/24/outline';

import {AdvertiserTable} from './AdvertiserTable';
import {SearchProgress, SearchStatusBadge} from './SearchBits';
import {
  ACTIVE_STATUS_LABEL, MEDIA_OPTIONS, api, countryName, duration, isRunning, languagesLabel, num, pct, usePolling, usd, type Search,
} from './shared';

function Figure({label, value, hint}: {label: string; value: string; hint?: string}) {
  return (
    <Card padding={4}>
      <VStack gap={1}>
        <Text type="supporting">{label}</Text>
        <Text type="display-3" hasTabularNumbers>
          {value}
        </Text>
        {hint && <Text type="supporting">{hint}</Text>}
      </VStack>
    </Card>
  );
}

export function SearchDetailView({id}: {id: number}) {
  const [search, setSearch] = useState<Search | null>(null);
  const [queuePosition, setQueuePosition] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [confirm, setConfirm] = useState<'cancel' | 'delete' | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  // Bumped whenever the search changes step, so the table reloads its rows.
  const [refreshKey, setRefreshKey] = useState(0);
  const lastStep = useRef('');

  const load = () =>
    api<{search: Search; queuePosition: number}>(`/api/searches/${id}`)
      .then(r => {
        setSearch(r.search);
        setQueuePosition(r.queuePosition);
        const step = `${r.search.status}:${r.search.advertisers_count}:${r.search.enriched_count}`;
        if (step !== lastStep.current) {
          lastStep.current = step;
          setRefreshKey(k => k + 1);
        }
      })
      .catch(e => ((e as Error).message.includes('no encontrada') ? setNotFound(true) : setError((e as Error).message)));
  useEffect(() => {
    load();
  }, [id]);
  usePolling(load, 2500, search != null && isRunning(search));

  async function act(kind: 'cancel' | 'delete') {
    setIsBusy(true);
    try {
      if (kind === 'cancel') {
        await api(`/api/searches/${id}/cancel`, {method: 'POST'});
        await load();
      } else {
        await api(`/api/searches/${id}`, {method: 'DELETE'});
        location.href = '/busquedas';
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsBusy(false);
      setConfirm(null);
    }
  }

  if (notFound) {
    return (
      <Layout
        height="fill"
        content={
          <LayoutContent padding={6}>
            <Banner status="warning" title="Esta búsqueda no existe o fue borrada" endContent={<Button label="Ir al historial" href="/busquedas" />} />
          </LayoutContent>
        }
      />
    );
  }
  if (!search) {
    return (
      <Layout
        height="fill"
        content={
          <LayoutContent padding={6}>
            {error ? <Banner status="error" title="No se pudo cargar la búsqueda" description={error} /> : <Spinner size="lg" label="Cargando búsqueda…" />}
          </LayoutContent>
        }
      />
    );
  }

  const running = isRunning(search);
  const isUrl = search.query.startsWith('http');
  const requested = search.results_limit * (isUrl ? 1 : search.countries.length);
  const isShort = !running && search.ads_notes !== '' && search.ads_count < requested;

  return (
    <Layout
      height="fill"
      contentWidth={1280}
      content={
        <LayoutContent padding={6}>
          <VStack gap={6}>
            <VStack gap={3}>
              <Text type="supporting">
                <Link href="/busquedas">
                  <HStack gap={1} vAlign="center">
                    <Icon icon={ArrowLeftIcon} size="sm" />
                    Historial
                  </HStack>
                </Link>
              </Text>
              <HStack gap={3} vAlign="center" wrap="wrap">
                <StackItem size="fill">
                  <HStack gap={3} vAlign="center" wrap="wrap">
                    <Heading level={1}>{isUrl ? 'Búsqueda por URL' : search.query}</Heading>
                    <SearchStatusBadge search={search} />
                  </HStack>
                </StackItem>
                {running ? (
                  <Button label="Cancelar búsqueda" variant="destructive" icon={<Icon icon={StopIcon} />} onClick={() => setConfirm('cancel')} />
                ) : (
                  <>
                    <Button label="Repetir" icon={<Icon icon={ArrowPathIcon} />} href={`/?repetir=${search.id}`} />
                    <Button label="Borrar" variant="ghost" icon={<Icon icon={TrashIcon} />} onClick={() => setConfirm('delete')} />
                  </>
                )}
              </HStack>
              {isUrl && (
                <Text color="secondary" maxLines={1}>
                  <Link href={search.query} isExternalLink>
                    {search.query}
                  </Link>
                </Text>
              )}
            </VStack>

            {running && (
              <Card padding={4}>
                <SearchProgress search={search} queuePosition={queuePosition} />
              </Card>
            )}
            {error && <Banner status="error" title="Algo falló" description={error} isDismissable onDismiss={() => setError(null)} />}
            {search.status === 'error' && search.error && <Banner status="error" title="La búsqueda terminó con un error" description={search.error} endContent={<Button label="Reintentar" href={`/?repetir=${search.id}`} />} />}
            {search.status === 'cancelled' && (
              <Banner status="warning" title="Búsqueda cancelada" description="Se guardó todo lo que alcanzó a extraer antes de cancelarla." />
            )}
            {isShort && (
              <Banner
                status="info"
                title={`Llegaron ${num.format(search.ads_count)} de ${num.format(requested)} anuncios pedidos`}
                description={`El límite es un máximo, no una cantidad garantizada: la Biblioteca de anuncios solo muestra los anuncios que coinciden con los filtros, y su "~N resultados" es una estimación que incluye anuncios que no lista. Por país:\n${search.ads_notes}`}
              />
            )}

            <Grid columns={{minWidth: 160}} gap={3}>
              <Figure
                label="Anuncios analizados"
                value={num.format(search.ads_count)}
                hint={search.raw_items > 0 ? `de ${num.format(requested)} pedidos · ${num.format(search.raw_items)} filas de Apify` : undefined}
              />
              <Figure label="Anunciantes" value={num.format(search.advertisers_count)} />
              <Figure label="Con email" value={num.format(search.with_email)} hint={pct(search.with_email, search.advertisers_count)} />
              <Figure label="Con teléfono" value={num.format(search.with_phone)} hint={pct(search.with_phone, search.advertisers_count)} />
              <Figure
                label="Costo en Apify"
                value={usd(search.cost_usd)}
                hint={
                  running || !search.cost_final
                    ? 'Provisional: Apify cierra la cuenta ~1 min después de terminar'
                    : search.cached_count > 0
                      ? `${num.format(search.cached_count)} páginas ya estaban en caché`
                      : 'Cobro real de Apify'
                }
              />
            </Grid>

            <MetadataList columns="multi" orientation="vertical" label={{position: 'top'}}>
              <MetadataListItem label="Países">{search.countries.map(countryName).join(', ')}</MetadataListItem>
              <MetadataListItem label="Anuncios">{ACTIVE_STATUS_LABEL[search.active_status] ?? search.active_status}</MetadataListItem>
              <MetadataListItem label="Formato">{MEDIA_OPTIONS.find(m => m.value === search.media_type)?.label ?? search.media_type}</MetadataListItem>
              <MetadataListItem label="Idioma">{languagesLabel(search.languages ?? [])}</MetadataListItem>
              <MetadataListItem label="Publicados desde">{search.newer_than ?? 'Cualquier fecha'}</MetadataListItem>
              <MetadataListItem label="Límite">{`${num.format(search.results_limit)} por país`}</MetadataListItem>
              <MetadataListItem label="Contactos">{search.enrich ? 'Sí' : 'No'}</MetadataListItem>
              <MetadataListItem label="Fecha de las páginas">{search.page_dates ? 'Sí' : 'No'}</MetadataListItem>
              <MetadataListItem label="Frase exacta">{search.exact ? 'Sí' : 'No'}</MetadataListItem>
              <MetadataListItem label="Iniciada">
                <Timestamp value={search.created_at} format="date_time" color="primary" type="body" />
              </MetadataListItem>
              <MetadataListItem label="Duración">{duration(search.created_at, search.finished_at)}</MetadataListItem>
            </MetadataList>

            <VStack gap={3}>
              <Heading level={2}>Anunciantes encontrados</Heading>
              <AdvertiserTable searchId={search.id} exportName={`busqueda-${search.id}-${search.query.slice(0, 30)}`} refreshKey={refreshKey} isLive={running} />
            </VStack>

            <AlertDialog
              isOpen={confirm != null}
              onOpenChange={o => !o && setConfirm(null)}
              title={confirm === 'cancel' ? '¿Cancelar esta búsqueda?' : '¿Borrar esta búsqueda?'}
              description={
                confirm === 'cancel'
                  ? 'Se detiene la ejecución en Apify. Lo que ya se extrajo se guarda; lo consumido hasta ahora se cobra igual.'
                  : 'Se borra del historial. Los anunciantes que encontró se quedan en tu base de datos.'
              }
              actionLabel={confirm === 'cancel' ? 'Cancelar búsqueda' : 'Borrar búsqueda'}
              cancelLabel="Volver"
              onAction={() => confirm && act(confirm)}
              isActionLoading={isBusy}
            />
          </VStack>
        </LayoutContent>
      }
    />
  );
}
