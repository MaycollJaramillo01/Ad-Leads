import {Badge} from '@astryxdesign/core/Badge';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {Text} from '@astryxdesign/core/Text';

import {SEARCH_STATUS, duration, num, type Search} from './shared';

export function SearchStatusBadge({search}: {search: Search}) {
  const s = SEARCH_STATUS[search.status];
  return <Badge variant={s.variant} label={s.label} />;
}

/** What the worker is doing right now, in words; shared by the list and the detail page. */
export function stepText(s: Search, queuePosition = -1): string {
  if (s.cancel_requested) return 'Cancelando… se guarda lo que ya se extrajo';
  if (s.status === 'queued') return queuePosition > 0 ? `En cola · ${queuePosition} búsqueda(s) por delante` : 'Preparando la búsqueda…';
  if (s.status === 'ads') return `Buscando anuncios en la Ads Library… ${num.format(s.progress)} encontrados`;
  if (s.status === 'pages') return `Extrayendo contactos… ${num.format(s.progress)} de ${num.format(s.progress_total)} páginas`;
  return '';
}

export function SearchProgress({search, queuePosition = -1, isCompact}: {search: Search; queuePosition?: number; isCompact?: boolean}) {
  const step = search.status === 'pages' ? 2 : 1;
  const total = Math.max(search.progress_total, 1);
  const text = stepText(search, queuePosition);
  return (
    <VStack gap={isCompact ? 1 : 2}>
      <ProgressBar
        label={text}
        isLabelHidden
        value={Math.min(search.progress, total)}
        max={total}
        isIndeterminate={search.status === 'queued' || search.progress === 0}
      />
      <HStack gap={3} hAlign="between" wrap="wrap">
        <Text color="secondary" type={isCompact ? 'supporting' : 'body'} aria-live="polite">
          {/* ponytail: raw span is the documented hook for the transitions.dev shimmer (Text has no className). */}
          <span className="t-shimmer" data-text={text}>
            {text}
          </span>
        </Text>
        {!isCompact && (
          <Text color="secondary" hasTabularNumbers>
            {`Paso ${step} de ${search.enrich ? 2 : 1} · ${duration(search.created_at, null)}`}
          </Text>
        )}
      </HStack>
    </VStack>
  );
}
