import type { ContentLocale } from '@lfd/contracts';
import {
  isShopCopyPreviewMessage,
  SHOP_COPY_PREVIEW_SOURCE,
  type ShopCopyPreviewOutbound,
} from '@lfd/contracts/shop-copy-preview';

import { COPY_LOCALES } from './copy-text';

/** Ce qu'il faut savoir d'un `MessageEvent` pour le juger — de quoi l'éprouver sans navigateur. */
export interface IncomingMessage {
  readonly origin: string;
  readonly source: unknown;
  readonly data: unknown;
}

/**
 * **La garde des messages de l'aperçu** (plan §10 B3) : un message n'est lu
 * que s'il vient de l'ORIGINE configurée ET de la FENÊTRE de notre iframe, et
 * s'il a la forme du protocole. Tout le reste est ignoré sans bruit — un autre
 * onglet, une extension, une autre iframe de la même origine.
 *
 * `origin` `null` (aperçu non configuré) : rien n'est jamais accepté.
 */
export function acceptPreviewMessage(
  event: IncomingMessage,
  origin: string | null,
  frame: unknown,
): ShopCopyPreviewOutbound | null {
  if (origin === null || event.origin !== origin) {
    return null;
  }
  if (frame === null || frame === undefined || event.source !== frame) {
    return null;
  }
  const data = event.data;
  if (!isShopCopyPreviewMessage(data)) {
    return null;
  }
  switch (data.type) {
    case 'ready':
      return { source: SHOP_COPY_PREVIEW_SOURCE, type: 'ready' };
    case 'pick':
      return 'key' in data && typeof data.key === 'string'
        ? { source: SHOP_COPY_PREVIEW_SOURCE, type: 'pick', key: data.key }
        : null;
    case 'visible-keys':
      return 'keys' in data && isStringArray(data.keys)
        ? { source: SHOP_COPY_PREVIEW_SOURCE, type: 'visible-keys', keys: data.keys }
        : null;
    case 'edit':
      return readEdit(data);
    default:
      return null;
  }
}

function isLocale(value: unknown): value is ContentLocale {
  return COPY_LOCALES.some((locale) => locale === value);
}

/** Un `edit` : une clé, une langue connue, un texte — rien de plus n'est lu. */
function readEdit(data: object): ShopCopyPreviewOutbound | null {
  const key = Object.hasOwn(data, 'key') ? Reflect.get(data, 'key') : undefined;
  const locale = Object.hasOwn(data, 'locale') ? Reflect.get(data, 'locale') : undefined;
  const text = Object.hasOwn(data, 'text') ? Reflect.get(data, 'text') : undefined;
  if (typeof key !== 'string' || typeof text !== 'string' || !isLocale(locale)) {
    return null;
  }
  return {
    source: SHOP_COPY_PREVIEW_SOURCE,
    type: 'edit',
    key,
    locale,
    text,
  };
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
