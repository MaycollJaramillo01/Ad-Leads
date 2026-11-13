import {useEffect, useMemo, useState} from 'react';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {DateInput} from '@astryxdesign/core/DateInput';
import {HStack, StackItem, VStack} from '@astryxdesign/core/Layout';
import {MultiSelector} from '@astryxdesign/core/MultiSelector';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import {Selector} from '@astryxdesign/core/Selector';
import {Switch} from '@astryxdesign/core/Switch';
import {Heading, Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {MagnifyingGlassIcon} from '@heroicons/react/24/outline';

import {COUNTRY_OPTIONS, MEDIA_OPTIONS, MIN_ADS_PER_RUN, PRICE_PER_AD, PRICE_PER_PAGE, REGIONS, api, num, usd, type Search} from './shared';

const ALL_OPTION = {value: 'ALL', label: 'Todos los países'};
const OPTIONS = [ALL_OPTION, {type: 'divider' as const}, ...COUNTRY_OPTIONS];
const isFacebookUrl = (s: string) => /^https:\/\/(www\.|m\.|web\.)?facebook\.com\//i.test(s.trim());

interface FormState {
  query: string;
  countries: string[];
  activeStatus: 'active' | 'inactive' | 'all';
  mediaType: string;
  newerThan?: string;
  limit: number;
  enrich: boolean;
  exact: boolean;
}

const DEFAULTS: FormState = {
  query: '',
  countries: ['US'],
  activeStatus: 'active',
  mediaType: 'all',
  newerThan: undefined,
  limit: 50,
  enrich: true,
  exact: false,
};

/** "Todos los países" is exclusive: picking it clears the rest, picking a country clears it. */
function nextCountries(prev: string[], next: string[]): string[] {
  const addedAll = next.includes('ALL') && !prev.includes('ALL');
  if (addedAll) return ['ALL'];
  return next.length > 1 ? next.filter(c => c !== 'ALL') : next;
}

export function NewSearchForm() {
  const [f, setF] = useState<FormState>(DEFAULTS);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repeatOf, setRepeatOf] = useState<number | null>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF(prev => ({...prev, [k]: v}));

  // /?repetir=ID prefills the form from an earlier search.
  useEffect(() => {
    const id = Number(new URLSearchParams(location.search).get('repetir'));
    if (!id) return;
    api<{search: Search}>(`/api/searches/${id}`)
      .then(({search: s}) => {
        setRepeatOf(s.id);
        setF({
          query: s.query,
          countries: s.countries,
          activeStatus: s.active_status as FormState['activeStatus'],
          mediaType: s.media_type,
          newerThan: s.newer_than ?? undefined,
          limit: Math.max(s.results_limit, MIN_ADS_PER_RUN),
          enrich: s.enrich,
          exact: s.exact,
        });
      })
      .catch(() => {});
  }, []);

  const isUrl = isFacebookUrl(f.query);
  const urlCount = isUrl ? 1 : f.countries.length;
  const maxAds = urlCount * f.limit;
  const estimate = maxAds * PRICE_PER_AD + (f.enrich ? maxAds * PRICE_PER_PAGE : 0);

  const queryError = touched && !f.query.trim() ? 'Escribe una palabra clave o pega una URL de Facebook.' : undefined;
  const countryError = touched && !isUrl && f.countries.length === 0 ? 'Elige al menos un país.' : undefined;

  const regionSelected = useMemo(
    () => REGIONS.find(r => r.codes.length === f.countries.length && r.codes.every(c => f.countries.includes(c)))?.label,
    [f.countries],
  );

  async function submit() {
    setTouched(true);
    setError(null);
    if (!f.query.trim() || (!isUrl && f.countries.length === 0)) return;
    try {
      const {search} = await api<{search: Search}>('/api/searches', {method: 'POST', body: f});
      location.href = `/busquedas/${search.id}`;
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Card padding={6}>
      <VStack gap={6}>
        <VStack gap={1}>
          <Heading level={2}>{repeatOf ? `Repetir búsqueda #${repeatOf}` : 'Nueva búsqueda'}</Heading>
          <Text color="secondary">
            Busca en la Biblioteca de anuncios de Meta. Cada anunciante encontrado se guarda en tu base de datos con su email,
            teléfono y dirección públicos.
          </Text>
        </VStack>

        <TextInput
          label="Palabra clave, marca o URL"
          description='Ej.: dentista, "clínica estética", inmobiliaria. También acepta una URL de la Ads Library o de una página de Facebook.'
          value={f.query}
          onChange={v => set('query', v)}
          onEnter={submit}
          placeholder="dentista"
          startIcon={MagnifyingGlassIcon}
          type="search"
          enterKeyHint="search"
          size="lg"
          hasClear
          isRequired
          hasAutoFocus={!repeatOf}
          status={queryError ? {type: 'error', message: queryError} : undefined}
        />

        <VStack gap={2}>
          <MultiSelector
            label="Países"
            description={isUrl ? 'Con una URL se usa el país que venga en ella.' : 'Se hace una búsqueda por cada país, con su propio límite de anuncios.'}
            options={OPTIONS}
            value={f.countries}
            onChange={v => set('countries', nextCountries(f.countries, v))}
            hasSearch
            searchPlaceholder="Buscar país…"
            triggerDisplay="badges"
            maxBadges={6}
            placeholder="Elige uno o varios países"
            isDisabled={isUrl}
            disabledMessage="La URL ya define el país"
            isRequired
            presentation="adaptive"
            status={countryError ? {type: 'error', message: countryError} : undefined}
          />
          <HStack gap={2} wrap="wrap" vAlign="center">
            <Text type="supporting">Atajos:</Text>
            {REGIONS.map(r => (
              <Button
                key={r.label}
                label={r.label}
                size="sm"
                variant={regionSelected === r.label ? 'primary' : 'secondary'}
                isDisabled={isUrl}
                onClick={() => set('countries', r.codes)}
              />
            ))}
            <Button label="Todos los países" size="sm" variant={f.countries[0] === 'ALL' ? 'primary' : 'secondary'} isDisabled={isUrl} onClick={() => set('countries', ['ALL'])} />
            {f.countries.length > 0 && <Button label="Limpiar" size="sm" variant="ghost" isDisabled={isUrl} onClick={() => set('countries', [])} />}
          </HStack>
        </VStack>

        <HStack gap={4} wrap="wrap" vAlign="start">
          <SegmentedControl label="Estado de los anuncios" value={f.activeStatus} onChange={v => set('activeStatus', v as FormState['activeStatus'])}>
            <SegmentedControlItem value="active" label="Activos" />
            <SegmentedControlItem value="inactive" label="Inactivos" />
            <SegmentedControlItem value="all" label="Todos" />
          </SegmentedControl>
          <Selector label="Formato" options={MEDIA_OPTIONS} value={f.mediaType} onChange={v => v && set('mediaType', v)} width={200} />
          <DateInput
            label="Publicados desde"
            value={f.newerThan as any}
            onChange={v => set('newerThan', v ?? undefined)}
            max={new Date().toISOString().slice(0, 10) as any}
            hasClear
            isOptional
            format="date"
            placeholder="Cualquier fecha"
          />
          <NumberInput
            label={isUrl ? 'Máximo de anuncios' : 'Anuncios por país'}
            value={f.limit}
            onChange={v => set('limit', Math.min(Math.max(Math.round(v) || MIN_ADS_PER_RUN, MIN_ADS_PER_RUN), 2000))}
            min={MIN_ADS_PER_RUN}
            max={2000}
            labelTooltip={`Mínimo ${MIN_ADS_PER_RUN}: Apify no acepta búsquedas más pequeñas.`}
            width={170}
          />
        </HStack>

        <VStack gap={3}>
          <Switch
            label="Extraer datos de contacto"
            description="Visita la página de cada anunciante para sacar email, teléfono, dirección, web e Instagram. Las páginas consultadas en los últimos 30 días no se cobran de nuevo."
            value={f.enrich}
            onChange={v => set('enrich', v)}
          />
          <Switch
            label="Frase exacta"
            description="Solo anuncios que contengan la frase tal cual, en ese orden."
            value={f.exact}
            onChange={v => set('exact', v)}
            isDisabled={isUrl}
          />
        </VStack>

        {error && <Banner status="error" title="No se pudo iniciar la búsqueda" description={error} />}

        <HStack gap={4} vAlign="center" wrap="wrap">
          <StackItem size="fill">
            <VStack gap={0.5}>
              <Text weight="medium">{`Costo máximo estimado: ${usd(estimate)}`}</Text>
              <Text type="supporting">
                {`Hasta ${num.format(maxAds)} anuncios${f.enrich ? ` y ${num.format(maxAds)} páginas` : ''} · precios del plan Free de Apify. Normalmente cuesta bastante menos: muchos anuncios son del mismo anunciante.`}
              </Text>
            </VStack>
          </StackItem>
          <Button label="Iniciar búsqueda" variant="primary" size="lg" clickAction={submit} />
        </HStack>
      </VStack>
    </Card>
  );
}
