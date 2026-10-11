import {
  isShopCopyPreviewMessage,
  SHOP_COPY_PREVIEW_JOURNEYS,
  SHOP_COPY_PREVIEW_SOURCE,
  type ShopCopyPreviewJourney,
  type ShopCopyPreviewOutbound,
  type ShopCopyPreviewShowMessage,
  type ShopCopyPreviewViewport,
} from '@lfd/contracts/shop-copy-preview';

import { LOCALES, type LocaleCode } from '../../../src/app/client/client-locale.service';

/** Ce que la garde lit d'un `MessageEvent` — rien de plus, pour se tester sans navigateur. */
export interface IncomingMessage {
  readonly origin: string;
  readonly source: unknown;
  readonly data: unknown;
}

/**
 * **La garde des messages entrants** (plan `plan-textes-de-la-boutique.md`, §5).
 *
 * Trois murs, dans cet ordre, et un message qui en franchit un de travers est
 * ignoré sans bruit :
 *
 * 1. l'**origine** est une de celles du back-office de cet environnement ;
 * 2. l'**émetteur** est la fenêtre qui nous encadre (`window.parent`), pas un
 *    onglet ouvert par nous ni une autre iframe de la même origine ;
 * 3. la **forme** est celle d'un `show` complet — chaque champ relu, rien de cru.
 *
 * Rend le message typé, ou `null`.
 */
export function readShowMessage(
  event: IncomingMessage,
  allowedOrigins: readonly string[],
  parent: unknown,
): ShopCopyPreviewShowMessage | null {
  if (!allowedOrigins.includes(event.origin) || event.source !== parent || parent === null) {
    return null;
  }
  const data = event.data;
  if (!isShopCopyPreviewMessage(data) || data.type !== 'show') {
    return null;
  }
  const journey = field(data, 'journey');
  const locale = field(data, 'locale');
  const viewport = field(data, 'viewport');
  const drafts = textRecord(field(data, 'drafts'));
  const published = textRecord(field(data, 'published'));
  const highlight = field(data, 'highlight');
  if (
    !isJourney(journey) ||
    !isLocale(locale) ||
    !isViewport(viewport) ||
    drafts === null ||
    published === null ||
    !(highlight === null || typeof highlight === 'string')
  ) {
    return null;
  }
  return {
    source: SHOP_COPY_PREVIEW_SOURCE,
    type: 'show',
    journey,
    locale,
    viewport,
    drafts,
    published,
    highlight,
  };
}

/** Le message sortant, toujours estampillé de la source du protocole. */
export function outbound(
  message: DistributiveOmit<ShopCopyPreviewOutbound, 'source'>,
): ShopCopyPreviewOutbound {
  return { ...message, source: SHOP_COPY_PREVIEW_SOURCE };
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function field(data: object, name: string): unknown {
  return Object.hasOwn(data, name) ? Reflect.get(data, name) : undefined;
}

function isJourney(value: unknown): value is ShopCopyPreviewJourney {
  return SHOP_COPY_PREVIEW_JOURNEYS.some((journey) => journey === value);
}

function isLocale(value: unknown): value is LocaleCode {
  return LOCALES.some((locale) => locale.code === value);
}

function isViewport(value: unknown): value is ShopCopyPreviewViewport {
  return value === 'mobile' || value === 'desktop';
}

/** Un dictionnaire clé → texte ; `null` dès qu'une valeur n'est pas une chaîne. */
function textRecord(value: unknown): Readonly<Record<string, string>> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const texts: Record<string, string> = {};
  for (const [key, text] of Object.entries(value)) {
    if (typeof text !== 'string') {
      return null;
    }
    texts[key] = text;
  }
  return texts;
}
