import {useEffect, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Grid} from '@astryxdesign/core/Grid';
import {HStack, Layout, LayoutContent, StackItem, VStack} from '@astryxdesign/core/Layout';
import {List, ListItem} from '@astryxdesign/core/List';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Timestamp} from '@astryxdesign/core/Timestamp';
import {ClockIcon} from '@heroicons/react/24/outline';
import {Icon} from '@astryxdesign/core/Icon';

import {NewSearchForm} from './NewSearchForm';
import {SearchProgress, SearchStatusBadge} from './SearchBits';
import {api, countriesLabel, isRunning, num, pct, usePolling, usd, type Search, type Stats} from './shared';

function StatTile({label, value, hint}: {label: string; value: string; hint?: string}) {
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

function RecentSearches({onChanged}: {onChanged: () => void}) {
  const [searches, setSearches] = useState<Search[] | null>(null);
  const load = () =>
    api<{searches: Search[]}>('/api/searches?limit=8')
      .then(r => setSearches(r.searches))
      .catch(() => setSearches([]));
  useEffect(() => {
    load();
  }, []);
  const anyRunning = searches?.some(isRunning) ?? false;
  usePolling(() => {
    load();
    onChanged();
  }, 3000, anyRunning);

  return (
    <VStack gap={3}>
      <HStack gap={3} vAlign="center">
        <StackItem size="fill">
          <Heading level={2}>Búsquedas recientes</Heading>
        </StackItem>
        <Button label="Ver historial" variant="ghost" href="/busquedas" />
      </HStack>
      {searches && searches.length === 0 ? (
        <EmptyState
          isCompact
          icon={<Icon icon={ClockIcon} size="lg" />}
          title="Aún no has hecho búsquedas"
          description="Las búsquedas que lances aparecerán aquí, aunque recargues la página o cierres el navegador."
        />
      ) : (
        <Card padding={0}>
          <List hasDividers density="spacious">
            {(searches ?? []).map(s => (
              <ListItem
                key={s.id}
                href={`/busquedas/${s.id}`}
                label={
                  <HStack gap={2} vAlign="center" wrap="wrap">
                    <Text weight="semibold" maxLines={1}>
                      {s.query}
                    </Text>
                    <SearchStatusBadge search={s} />
                  </HStack>
                }
                description={
                  isRunning(s) ? (
                    <SearchProgress search={s} isCompact />
                  ) : (
                    <HStack gap={2} wrap="wrap">
                      <Text type="supporting">{countriesLabel(s.countries)}</Text>
                      <Text type="supporting">·</Text>
                      <Timestamp value={s.created_at} format="relative" />
                    </HStack>
                  )
                }
                endContent={
                  !isRunning(s) && (
                    <VStack gap={0}>
                      <Text hasTabularNumbers justify="end" display="block">{`${num.format(s.advertisers_count)} anunciantes`}</Text>
                      <Text type="supporting" justify="end" display="block">{`${num.format(s.with_email)} con email`}</Text>
                    </VStack>
                  )
                }
              />
            ))}
          </List>
        </Card>
      )}
    </VStack>
  );
}

export function HomeView({stats, onChanged}: {stats: Stats | null; onChanged: () => void}) {
  return (
    <Layout
      height="fill"
      contentWidth={1100}
      content={
        <LayoutContent padding={6}>
          <VStack gap={8}>
            <Grid columns={{minWidth: 170}} gap={3}>
              <StatTile label="Anunciantes guardados" value={stats ? num.format(stats.advertisers) : '—'} />
              <StatTile
                label="Con email"
                value={stats ? num.format(stats.withEmail) : '—'}
                hint={stats?.advertisers ? `${pct(stats.withEmail, stats.advertisers)} del total` : undefined}
              />
              <StatTile
                label="Con teléfono"
                value={stats ? num.format(stats.withPhone) : '—'}
                hint={stats?.advertisers ? `${pct(stats.withPhone, stats.advertisers)} del total` : undefined}
              />
              <StatTile label="Anuncios analizados" value={stats ? num.format(stats.ads) : '—'} hint={stats ? `${num.format(stats.searches)} búsquedas` : undefined} />
              <StatTile label="Gasto en Apify" value={stats ? usd(stats.costUsd) : '—'} hint="Costo real de cada ejecución" />
            </Grid>
            <NewSearchForm />
            <RecentSearches onChanged={onChanged} />
          </VStack>
        </LayoutContent>
      }
    />
  );
}
