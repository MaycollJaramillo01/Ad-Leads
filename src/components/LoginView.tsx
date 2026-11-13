// Copyright (c) Meta Platforms, Inc. and affiliates.
// From the Astryx `login` template: one password, since AdLeads has a single owner.

import {useState, type CSSProperties} from 'react';
import {VStack} from '@astryxdesign/core/Layout';
import {Center} from '@astryxdesign/core/Center';
import {Text, Heading} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Icon} from '@astryxdesign/core/Icon';
import {Banner} from '@astryxdesign/core/Banner';
import {MegaphoneIcon} from '@heroicons/react/24/outline';

// Standalone auth page paints its own body background (no host shell).
const pageStyle: CSSProperties = {
  minHeight: '100%',
  backgroundColor: 'var(--color-background-body)',
};
// Cap the column at 400px but let it shrink to fit narrow screens (Stack
// has no maxWidth prop, so it's set here).
const contentStyle: CSSProperties = {
  width: '100%',
  maxWidth: 400,
};

/** Only same-site paths, so the login can't be used to bounce people to another site. */
function nextPath(): string {
  const next = new URLSearchParams(location.search).get('next') ?? '/';
  return next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export function LoginView() {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  async function signIn() {
    setError('');
    if (!password) {
      setError('Escribe la contraseña.');
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({password}),
      });
      if (res.ok) {
        location.href = nextPath();
        return;
      }
      setError((await res.json().catch(() => null))?.error ?? 'No se pudo iniciar sesión.');
    } catch {
      setError('No hay conexión con el servidor.');
    }
    setIsLoading(false);
  }

  return (
    <Center axis="both" padding={6} style={pageStyle}>
      <VStack gap={4} hAlign="center" style={contentStyle}>
        <VStack gap={2} hAlign="center">
          <Icon icon={MegaphoneIcon} size="lg" />
          <Text type="body" weight="bold" size="lg">
            AdLeads
          </Text>
        </VStack>

        <Card padding={8} width="100%">
          <VStack gap={4} hAlign="stretch">
            <VStack gap={1} hAlign="center">
              <Heading level={1}>Entrar</Heading>
              <Text type="body" color="secondary" size="sm">
                Escribe la contraseña de acceso de esta app.
              </Text>
            </VStack>

            {error && <Banner status="error" title={error} container="card" />}

            <TextInput
              label="Contraseña"
              value={password}
              onChange={setPassword}
              onEnter={signIn}
              type="password"
              size="lg"
              hasAutoFocus
            />

            <Button label="Entrar" variant="primary" size="lg" isLoading={isLoading} onClick={signIn} />
          </VStack>
        </Card>
      </VStack>
    </Center>
  );
}
