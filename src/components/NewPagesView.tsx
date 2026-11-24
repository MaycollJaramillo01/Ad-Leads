import {useEffect, useState} from 'react';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {HStack, Layout, LayoutContent, StackItem, VStack} from '@astryxdesign/core/Layout';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import {Heading, Text} from '@astryxdesign/core/Text';
import {PlusIcon} from '@heroicons/react/24/outline';

import {AdvertiserTable} from './AdvertiserTable';
import {api, num, type Search, type Stats} from './shared';

const RANGES = ['7', '30', '90'] as const;
type Range = (typeof RANGES)[number];

/** Advertisers whose Facebook page is recent: new businesses, often the warmest leads. */
export function NewPagesView({stats}: {stats: Stats | null}) {
  const [range, setRange] = useState<Range>(() => {
    const d = new URLSearchParams(location.search).get('dias') as Range | null;
    return d && RANGES.includes(d) ? d : '30';
  });
  const [searches, setSearches] = useState<Search[]>([]);
  useEffect(() => {
    api<{searches: Search[]}>('/api/searches?limit=500')
      .then(r => setSearches(r.searches))
      .catch(() => {});
  }, []);

  const days = Number(range);
  const label = range === '7' ? 'la última semana' : range === '30' ? 'el último mes' : 'los últimos 3 meses';

  return (
    <Layout
      height="fill"
      contentWidth={1400}
      content={
        <LayoutContent padding={6}>
          <VStack gap={6}>
            <HStack gap={3} vAlign="center" wrap="wrap">
              <StackItem size="fill">
                <VStack gap={1}>
                  <Heading level={1}>Páginas nuevas</Heading>
                  <Text color="secondary">{`Anunciantes cuya página de Facebook se creó en ${label}. Negocios recién abiertos que ya están pagando anuncios.`}</Text>
                </VStack>
              </StackItem>
              <Button label="Nueva búsqueda" variant="primary" icon={<Icon icon={PlusIcon} />} href="/" />
            </HStack>

            {stats && stats.withCreated === 0 && (
              <Banner
                status="info"
                title="Todavía no hay fechas de creación"
                description='Al lanzar una búsqueda, activa "Fecha de creación de la página". Las páginas que encuentre aparecerán aquí según cuándo se crearon.'
                endContent={<Button label="Nueva búsqueda" href="/" />}
              />
            )}

            <HStack gap={3} vAlign="center" wrap="wrap">
              <SegmentedControl label="Creada en" value={range} onChange={v => setRange(v as Range)}>
                <SegmentedControlItem value="7" label="Última semana" />
                <SegmentedControlItem value="30" label="Último mes" />
                <SegmentedControlItem value="90" label="Últimos 3 meses" />
              </SegmentedControl>
              {stats && stats.withCreated > 0 && (
                <Text type="supporting">{`Fecha conocida para ${num.format(stats.withCreated)} de ${num.format(stats.advertisers)} anunciantes.`}</Text>
              )}
            </HStack>

            <AdvertiserTable
              key={range}
              createdDays={days}
              searches={searches}
              exportName={`paginas-nuevas-${days}-dias`}
              defaultSort={{sort: 'page_created', dir: 'desc'}}
            />
          </VStack>
        </LayoutContent>
      }
    />
  );
}
