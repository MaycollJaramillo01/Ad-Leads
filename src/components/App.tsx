// Frame from the Astryx `AppShellSideNavOnly` block; each Astro page mounts this with its view.
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';

import {useEffect, useState} from 'react';
import {Theme} from '@astryxdesign/core/theme';
import {InternationalizationProvider} from '@astryxdesign/core/i18n';
import esES from '@astryxdesign/core/locales/es-ES.generated.js';
import {AppShell} from '@astryxdesign/core/AppShell';
import {Badge} from '@astryxdesign/core/Badge';
import {Icon} from '@astryxdesign/core/Icon';
import {NavIcon} from '@astryxdesign/core/NavIcon';
import {SideNav, SideNavHeading, SideNavItem, SideNavSection} from '@astryxdesign/core/SideNav';
import {Text} from '@astryxdesign/core/Text';
import {
  ClockIcon as ClockOutline,
  MagnifyingGlassIcon as SearchOutline,
  UsersIcon as UsersOutline,
  MegaphoneIcon,
} from '@heroicons/react/24/outline';
import {ClockIcon, MagnifyingGlassIcon, UsersIcon} from '@heroicons/react/24/solid';

import {themes, defaultThemeSlug} from '../astryx-themes';
import {api, num, usePolling, type Stats} from './shared';
import {HomeView} from './HomeView';
import {SearchesView} from './SearchesView';
import {SearchDetailView} from './SearchDetailView';
import {AdvertisersView} from './AdvertisersView';

export type View = 'home' | 'searches' | 'search' | 'advertisers';

function Shell({view, id}: {view: View; id?: number}) {
  const [stats, setStats] = useState<Stats | null>(null);
  const load = () => api<Stats>('/api/stats').then(setStats).catch(() => {});
  useEffect(() => {
    load();
  }, []);
  // Keeps the "running" badge and counts honest while a search works in the background.
  usePolling(load, 5000, true);

  return (
    <AppShell
      contentPadding={0}
      height="fill"
      sideNav={
        <SideNav
          header={
            <SideNavHeading
              icon={<NavIcon icon={<Icon icon={MegaphoneIcon} size="sm" />} />}
              heading="AdLeads"
              headingHref="/"
            />
          }
          footer={
            stats ? (
              <Text type="supporting">{`Gasto total en Apify: ${new Intl.NumberFormat('es', {style: 'currency', currency: 'USD'}).format(stats.costUsd)}`}</Text>
            ) : undefined
          }>
          <SideNavSection title="Principal" isHeaderHidden>
            <SideNavItem label="Nueva búsqueda" icon={SearchOutline} selectedIcon={MagnifyingGlassIcon} href="/" isSelected={view === 'home'} />
            <SideNavItem
              label="Historial"
              icon={ClockOutline}
              selectedIcon={ClockIcon}
              href="/busquedas"
              isSelected={view === 'searches' || view === 'search'}
              endContent={stats && stats.running > 0 ? <Badge variant="info" label={`${stats.running} en curso`} /> : undefined}
            />
            <SideNavItem
              label="Anunciantes"
              icon={UsersOutline}
              selectedIcon={UsersIcon}
              href="/anunciantes"
              isSelected={view === 'advertisers'}
              endContent={stats ? <Badge label={num.format(stats.advertisers)} /> : undefined}
            />
          </SideNavSection>
        </SideNav>
      }>
      {view === 'home' && <HomeView stats={stats} onChanged={load} />}
      {view === 'searches' && <SearchesView />}
      {view === 'search' && id != null && <SearchDetailView id={id} />}
      {view === 'advertisers' && <AdvertisersView />}
    </AppShell>
  );
}

export default function App(props: {view: View; id?: number}) {
  return (
    <InternationalizationProvider locale="es-ES" messages={{'es-ES': esES}}>
      <Theme theme={themes[defaultThemeSlug]}>
        <Shell {...props} />
      </Theme>
    </InternationalizationProvider>
  );
}
