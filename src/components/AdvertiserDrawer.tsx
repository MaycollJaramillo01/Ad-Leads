import {useEffect, useState} from 'react';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Divider} from '@astryxdesign/core/Divider';
import {Drawer, DrawerHeader} from '@astryxdesign/core/Drawer';
import {HStack, Layout, LayoutContent, StackItem, VStack} from '@astryxdesign/core/Layout';
import {Lightbox} from '@astryxdesign/core/Lightbox';
import {Link} from '@astryxdesign/core/Link';
import {List, ListItem} from '@astryxdesign/core/List';
import {MetadataList, MetadataListItem} from '@astryxdesign/core/MetadataList';
import {Selector} from '@astryxdesign/core/Selector';
import {Spinner} from '@astryxdesign/core/Spinner';
import {Heading, Text} from '@astryxdesign/core/Text';
import {TextArea} from '@astryxdesign/core/TextArea';
import {Thumbnail} from '@astryxdesign/core/Thumbnail';
import {Timestamp} from '@astryxdesign/core/Timestamp';

import {LEAD_STATUS, LEAD_STATUS_OPTIONS, api, countryName, num, shortUrl, type Ad, type AdvertiserDetail, type LeadStatus} from './shared';

const adLibraryUrl = (pageId: string) =>
  `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=${pageId}`;

const Missing = () => <Text color="disabled">No publicado</Text>;

function AdCard({ad, onOpenMedia}: {ad: Ad; onOpenMedia: () => void}) {
  return (
    <Card padding={3}>
      <HStack gap={3} vAlign="start">
        {ad.image_url && <Thumbnail src={ad.image_url} alt={ad.title || 'Creatividad del anuncio'} label="Ver creatividad" onClick={onOpenMedia} />}
        <StackItem size="fill">
          <VStack gap={1.5}>
            <HStack gap={2} wrap="wrap" vAlign="center">
              <Badge variant={ad.is_active ? 'success' : 'neutral'} label={ad.is_active ? 'Activo' : 'Inactivo'} />
              {ad.video_url && <Badge variant="purple" label="Video" />}
              {ad.country && <Badge label={ad.country} />}
              {ad.variants > 1 && <Badge label={`${ad.variants} variantes`} />}
              {ad.start_date && <Timestamp value={ad.start_date} format="date" />}
            </HStack>
            {ad.title && <Text weight="semibold">{ad.title}</Text>}
            {ad.body ? (
              <Text color="secondary" maxLines={5}>
                {ad.body}
              </Text>
            ) : (
              <Text color="disabled">Sin texto</Text>
            )}
            <HStack gap={3} wrap="wrap" vAlign="center">
              {ad.cta && <Text type="supporting">{`Botón: ${ad.cta}`}</Text>}
              {ad.link_url && (
                <Text type="supporting" maxLines={1}>
                  <Link href={ad.link_url} isExternalLink>
                    {shortUrl(ad.link_url)}
                  </Link>
                </Text>
              )}
              <Link href={`https://www.facebook.com/ads/library/?id=${ad.ad_id}`} isExternalLink>
                Ver anuncio
              </Link>
            </HStack>
          </VStack>
        </StackItem>
      </HStack>
    </Card>
  );
}

export function AdvertiserDrawer({pageId, onClose, onChanged}: {pageId: string | null; onClose: () => void; onChanged: () => void}) {
  const [adv, setAdv] = useState<AdvertiserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [savedNotes, setSavedNotes] = useState('');
  const [mediaIndex, setMediaIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!pageId) return;
    setAdv(null);
    setError(null);
    api<AdvertiserDetail>(`/api/advertisers/${pageId}`)
      .then(a => {
        setAdv(a);
        setNotes(a.notes);
        setSavedNotes(a.notes);
      })
      .catch(e => setError((e as Error).message));
  }, [pageId]);

  async function patch(body: {status?: LeadStatus; notes?: string}) {
    if (!adv) return;
    try {
      const a = await api<AdvertiserDetail>(`/api/advertisers/${adv.page_id}`, {method: 'PATCH', body});
      setAdv(a);
      setSavedNotes(a.notes);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const media = (adv?.ads ?? []).filter(a => a.image_url);
  const contactCount = adv ? [adv.email, adv.phone, adv.address, adv.website].filter(Boolean).length : 0;

  return (
    <Drawer isOpen={pageId != null} onOpenChange={o => !o && onClose()} label={adv ? `Ficha de ${adv.name}` : 'Ficha del anunciante'} width={560}>
      <Layout
        header={
          <DrawerHeader
            title={adv?.name ?? 'Cargando…'}
            subtitle={adv ? [adv.category, adv.followers != null ? `${num.format(adv.followers)} seguidores` : ''].filter(Boolean).join(' · ') : undefined}
            startContent={adv ? <Avatar src={adv.profile_pic || undefined} name={adv.name} size="md" tooltip={false} /> : undefined}
            onOpenChange={o => !o && onClose()}
          />
        }
        content={
          <LayoutContent>
            {error && <Banner status="error" title="No se pudo cargar o guardar" description={error} />}
            {!adv && !error && <Spinner size="lg" label="Cargando ficha…" />}
            {adv && (
              <VStack gap={6}>
                <HStack gap={2} wrap="wrap">
                  {adv.page_url && <Button label="Abrir página de Facebook" href={adv.page_url} target="_blank" size="sm" />}
                  <Button label="Ver en Ads Library" href={adLibraryUrl(adv.page_id)} target="_blank" size="sm" />
                  {adv.email && <Button label="Enviar email" variant="primary" href={`mailto:${adv.email}`} size="sm" />}
                </HStack>

                <VStack gap={3}>
                  <Heading level={3}>Seguimiento</Heading>
                  <Selector
                    label="Estado"
                    options={LEAD_STATUS_OPTIONS}
                    value={adv.status}
                    onChange={v => v && patch({status: v as LeadStatus})}
                    width={220}
                  />
                  <TextArea label="Notas" value={notes} onChange={setNotes} rows={3} placeholder="Ej.: llamar el lunes, pidió precios…" />
                  <HStack gap={2} vAlign="center">
                    <Button label="Guardar notas" size="sm" isDisabled={notes === savedNotes} clickAction={() => patch({notes})} />
                    {notes !== savedNotes && <Text type="supporting">Cambios sin guardar</Text>}
                  </HStack>
                </VStack>

                <Divider />

                <VStack gap={3}>
                  <HStack gap={2} vAlign="center">
                    <Heading level={3}>Contacto</Heading>
                    {!adv.enriched_at && <Badge variant="warning" label="Sin extraer" />}
                  </HStack>
                  {adv.enriched_at && contactCount === 0 && (
                    <Text color="secondary">Esta página no publica datos de contacto en su sección "Información".</Text>
                  )}
                  <MetadataList label={{position: 'start', width: 110}}>
                    <MetadataListItem label="Email">{adv.email ? <Link href={`mailto:${adv.email}`}>{adv.email}</Link> : <Missing />}</MetadataListItem>
                    <MetadataListItem label="Teléfono">
                      {adv.phone ? <Link href={`tel:${adv.phone.replace(/[^\d+]/g, '')}`}>{adv.phone}</Link> : <Missing />}
                    </MetadataListItem>
                    <MetadataListItem label="Dirección">
                      {adv.address ? (
                        <Link href={`https://www.google.com/maps/search/${encodeURIComponent(adv.address)}`} isExternalLink>
                          {adv.address}
                        </Link>
                      ) : (
                        <Missing />
                      )}
                    </MetadataListItem>
                    <MetadataListItem label="Sitio web">
                      {adv.website ? (
                        <Link href={adv.website} isExternalLink>
                          {shortUrl(adv.website)}
                        </Link>
                      ) : (
                        <Missing />
                      )}
                    </MetadataListItem>
                    <MetadataListItem label="Instagram">
                      {adv.instagram ? (
                        <Link href={adv.instagram} isExternalLink>
                          {shortUrl(adv.instagram).replace(/^instagram\.com\//, '@')}
                        </Link>
                      ) : (
                        <Missing />
                      )}
                    </MetadataListItem>
                    <MetadataListItem label="Países">{adv.countries.length ? adv.countries.map(countryName).join(', ') : '—'}</MetadataListItem>
                    <MetadataListItem label="Valoración">{adv.rating != null ? `${adv.rating}% lo recomienda` : '—'}</MetadataListItem>
                    <MetadataListItem label="Página creada">{adv.page_created || '—'}</MetadataListItem>
                    <MetadataListItem label="Primera vez visto">
                      <Timestamp value={adv.first_seen} format="date_time" />
                    </MetadataListItem>
                    <MetadataListItem label="Contactos de">{adv.enriched_at ? <Timestamp value={adv.enriched_at} format="relative" /> : 'Nunca extraídos'}</MetadataListItem>
                  </MetadataList>
                </VStack>

                <Divider />

                <VStack gap={3}>
                  <Heading level={3}>{`Anuncios guardados (${num.format(adv.ads_total)} · ${num.format(adv.ads_active)} activos)`}</Heading>
                  {adv.ads.map(ad => (
                    <AdCard key={ad.ad_id} ad={ad} onOpenMedia={() => setMediaIndex(media.indexOf(ad))} />
                  ))}
                </VStack>

                {adv.searches.length > 0 && (
                  <>
                    <Divider />
                    <VStack gap={2}>
                      <Heading level={3}>Encontrado en estas búsquedas</Heading>
                      <List hasDividers edge="flush">
                        {adv.searches.map(s => (
                          <ListItem
                            key={s.id}
                            href={`/busquedas/${s.id}`}
                            label={s.query}
                            description={`${s.countries.join(', ')} · ${s.ads_count} anuncio(s)`}
                            endContent={<Timestamp value={s.created_at} format="relative" />}
                          />
                        ))}
                      </List>
                    </VStack>
                  </>
                )}
              </VStack>
            )}
            {media.length > 0 && (
              <Lightbox
                isOpen={mediaIndex != null}
                onOpenChange={o => !o && setMediaIndex(null)}
                media={media.map(a => ({src: a.image_url, alt: a.title || a.body.slice(0, 80) || 'Creatividad', caption: a.title || undefined}))}
                index={mediaIndex ?? 0}
                onIndexChange={setMediaIndex}
                hasZoom
              />
            )}
          </LayoutContent>
        }
      />
    </Drawer>
  );
}

export const LEAD_BADGE = (status: LeadStatus) => <Badge variant={LEAD_STATUS[status].variant} label={LEAD_STATUS[status].label} />;
