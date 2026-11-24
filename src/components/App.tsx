// Frame from the Astryx `AppShellSideNavOnly` block; each Astro page mounts this with its view.
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';

import {useEffect, useState} from 'react';
import {Theme} from '@astryxdesign/core/theme';
import {InternationalizationProvider} from '@astryxdesign/core/i18n';
import esES from '@astryxdesign/core/locales/es-ES.generated.js';
import {AppShell} from '@astryxdesign/core/AppShell';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {VStack} from '@astryxdesign/core/Layout';
import {NavIcon} from '@astryxdesign/core/NavIcon';
import {SideNav, SideNavHeading, SideNavItem, SideNavSection} from '@astryxdesign/core/SideNav';
import {Text} from '@astryxdesign/core/Text';
import {
  ArrowRightStartOnRectangleIcon,
  ClockIcon as ClockOutline,
  MagnifyingGlassIcon as SearchOutline,
  UsersIcon as UsersOutline,
  SparklesIcon as SparklesOutline,
  MegaphoneIcon,
} from '@heroicons/react/24/outline';
import {ClockIcon, MagnifyingGlassIcon, SparklesIcon, UsersIcon} from '@heroicons/react/24/solid';

import {themes, defaultThemeSlug} from '../astryx-themes';
import {api, num, usePolling, type Stats} from './shared';
import {HomeView} from './HomeView';
import {SearchesView} from './SearchesView';
import {SearchDetailView} from './SearchDetailView';
import {AdvertisersView} from './AdvertisersView';
import {LoginView} from './LoginView';
import {NewPagesView} from './NewPagesView';

export type View = 'home' | 'searches' | 'search' | 'advertisers' | 'newpages' | 'login';

const logout = () => fetch('/api/login', {method: 'DELETE'}).finally(() => (location.href = '/login'));

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
              <VStack gap={2} hAlign="start">
                <Text type="supporting">{`Gasto total en Apify: ${new Intl.NumberFormat('es', {style: 'currency', currency: 'USD'}).format(stats.costUsd)}`}</Text>
                {stats.auth && (
                  <Button label="Cerrar sesión" variant="ghost" size="sm" icon={<Icon icon={ArrowRightStartOnRectangleIcon} />} onClick={logout} />
                )}
              </VStack>
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
            <SideNavItem
              label="Páginas nuevas"
              icon={SparklesOutline}
              selectedIcon={SparklesIcon}
              href="/paginas-nuevas"
              isSelected={view === 'newpages'}
              endContent={stats && stats.newPages > 0 ? <Badge label={num.format(stats.newPages)} /> : undefined}
            />
          </SideNavSection>
        </SideNav>
      }>
      {view === 'home' && <HomeView stats={stats} onChanged={load} />}
      {view === 'searches' && <SearchesView />}
      {view === 'search' && id != null && <SearchDetailView id={id} />}
      {view === 'advertisers' && <AdvertisersView />}
      {view === 'newpages' && <NewPagesView stats={stats} />}
    </AppShell>
  );
}

export default function App(props: {view: View; id?: number}) {
  return (
    <InternationalizationProvider locale="es-ES" messages={{'es-ES': esES}}>
      <Theme theme={themes[defaultThemeSlug]}>{props.view === 'login' ? <LoginView /> : <Shell {...props} />}</Theme>
    </InternationalizationProvider>
  );
}
