import {
  isShopCopyPreviewMessage,
  isShopCopyPreviewScene,
  SHOP_COPY_AUDIENCES,
  SHOP_COPY_ORDER_STEPS,
  SHOP_COPY_PREVIEW_SOURCE,
  type ShopCopyAudience,
  type ShopCopyPreviewStep,
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
 * 2. l'**émetteur** est la fenêtre du back-office — celle qui nous encadre
 *    (`window.parent`), ou celle qui nous a ouverts (`window.opener`, la
 *    fenêtre détachée du 2026-10-11) —, pas un onglet ouvert par nous ni une
 *    autre fenêtre de la même origine ;
 * 3. la **forme** est celle d'un `show` complet — chaque champ relu, rien de cru.
 *
 * Rend le message typé, ou `null`.
 */
export function readShowMessage(
  event: IncomingMessage,
  allowedOrigins: readonly string[],
  editor: unknown,
): ShopCopyPreviewShowMessage | null {
  if (
    !allowedOrigins.includes(event.origin) ||
    editor === null ||
    editor === undefined ||
    event.source !== editor
  ) {
    return null;
  }
  const data = event.data;
  if (!isShopCopyPreviewMessage(data) || data.type !== 'show') {
    return null;
  }
  const audience = field(data, 'audience');
  const step = field(data, 'step');
  const locale = field(data, 'locale');
  const viewport = field(data, 'viewport');
  const drafts = textRecord(field(data, 'drafts'));
  const published = textRecord(field(data, 'published'));
  const highlight = field(data, 'highlight');
  if (
    !isAudience(audience) ||
    !isStep(step) ||
    !isShopCopyPreviewScene(audience, step) ||
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
    audience,
    step,
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

function isAudience(value: unknown): value is ShopCopyAudience {
  return SHOP_COPY_AUDIENCES.some((audience) => audience === value);
}

const STEPS: readonly ShopCopyPreviewStep[] = [
  ...SHOP_COPY_ORDER_STEPS,
  'orders',
  'loyalty',
  'account',
];

function isStep(value: unknown): value is ShopCopyPreviewStep {
  return STEPS.some((step) => step === value);
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
