import {useEffect, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {HStack, Layout, LayoutContent, StackItem, VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {PlusIcon} from '@heroicons/react/24/outline';

import {AdvertiserTable} from './AdvertiserTable';
import {api, type Search} from './shared';

export function AdvertisersView() {
  const [searches, setSearches] = useState<Search[]>([]);
  useEffect(() => {
    api<{searches: Search[]}>('/api/searches?limit=500')
      .then(r => setSearches(r.searches))
      .catch(() => {});
  }, []);

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
                  <Heading level={1}>Anunciantes</Heading>
                  <Text color="secondary">
                    Tu base de datos: cada anunciante de todas tus búsquedas, sin duplicados. Marca su estado, añade notas y exporta.
                  </Text>
                </VStack>
              </StackItem>
              <Button label="Nueva búsqueda" variant="primary" icon={<Icon icon={PlusIcon} />} href="/" />
            </HStack>
            <AdvertiserTable searches={searches} exportName="anunciantes" />
          </VStack>
        </LayoutContent>
      }
    />
  );
}
