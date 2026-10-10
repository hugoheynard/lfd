import type { ShopOperationView } from '@lfd/contracts';

import type { LocaleCode } from '../client-locale.service';
import type { ClientCopy } from '../copy/client-copy.model';
import { fill } from '../copy/client-copy.service';
import { SHEET_WIDTHS, mediaSrcset, sizedMedia } from './media-source';
import { SHOP_TIME_ZONE } from '../shop-time-zone';
import { SHELF_PARAM } from './shelves';
import { operationShelfId, operationText, pickupSpan, shortDate } from './operations';

/**
 * **L'opération datée mise en avant sur l'accueil** — Pâques, Noël, ce que le
 * fournil décide (L6 de `documentation/mediatheque/plan-la-mediatheque-amelioree.md`).
 *
 * Remplace la simulation `MOCK_EVENT` (retirée le 2026-10-10) : la carte est
 * désormais dérivée d'une {@link ShopOperationView} de `GET /shop/catalogue`,
 * que le serveur a déjà filtrée par clientèle et par fenêtre.
 *
 * `null` reste un état de PREMIÈRE CLASSE : sans opération, le bloc n'existe pas.
 */
export interface DatedEvent {
  /** L'état quand il change ce qu'on peut faire (« Ouvre le 15 nov. », « Commandes closes ») ; `null` ouverte. */
  readonly badge: string | null;
  /** Le compte à rebours, tel qu'il s'écrit (« J‑9 », « Dernier jour ») ; `null` close. */
  readonly countdown: string | null;
  readonly title: string;
  /** « Retrait du 20 au 24 déc. » */
  readonly dates: string;
  /** L'accroche de l'opération, vide quand le référentiel n'en a pas. */
  readonly teaser: string;
  /** La photo redimensionnée, ou `null` : la bannière garde alors son aplat de la palette. */
  readonly image: DatedEventImage | null;
  /** Où mène la carte : la boutique… */
  readonly route: string;
  /** …ouverte sur le rayon de l'opération (`?rayon=op:<key>`). */
  readonly queryParams: Readonly<Record<string, string>>;
}

export interface DatedEventImage {
  readonly src: string;
  /** Vide quand l'URL n'est pas du fonds (cf. `media-source.ts`). */
  readonly srcset: string;
  readonly alt: string;
}

/** La boutique ; le rayon s'ouvre par `?rayon=` (cf. `shelf-address.ts`). */
const SHOP_ROUTE = '/boutique';

const DAY_MS = 86_400_000;

/** `AAAA-MM-JJ` à Paris — `en-CA` écrit le jour dans cet ordre. */
const PARIS_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: SHOP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Les jours CALENDAIRES de Paris entre `now` et `instant`, jamais négatifs ;
 * `null` pour un instant illisible. Même règle que `daysUntil` de
 * `storefront/operation-badge.ts`, réécrite sans `instantToLocal` : celle-là est
 * une VALEUR du baril `@lfd/contracts`, et l'accueil est au démarrage.
 */
export function parisDaysUntil(instant: string, now: Date): number | null {
  const target = new Date(instant);
  if (Number.isNaN(target.getTime())) {
    return null;
  }
  const midday = (date: Date): number => Date.parse(`${PARIS_DAY.format(date)}T12:00:00.000Z`);
  return Math.max(Math.round((midday(target) - midday(now)) / DAY_MS), 0);
}

const STATE_RANK: Readonly<Record<ShopOperationView['state'], number>> = {
  open: 0,
  announced: 1,
  closed: 2,
};

/** L'instant qui compte pour l'état : la clôture d'une ouverte, l'ouverture d'une annoncée. */
function deadlineOf(operation: ShopOperationView): string {
  return operation.state === 'announced' ? operation.orderFrom : operation.orderUntil;
}

/**
 * **La plus pertinente** : commandes ouvertes d'abord, puis annoncées, puis
 * closes (encore dans leur fenêtre de retrait) ; à état égal, l'échéance la
 * plus proche — la clôture pour une ouverte, l'ouverture pour une annoncée.
 */
export function featuredOperation(
  operations: readonly ShopOperationView[],
): ShopOperationView | null {
  let best: ShopOperationView | null = null;
  for (const candidate of operations) {
    if (best === null || precedes(candidate, best)) {
      best = candidate;
    }
  }
  return best;
}

function precedes(a: ShopOperationView, b: ShopOperationView): boolean {
  const rank = STATE_RANK[a.state] - STATE_RANK[b.state];
  if (rank !== 0) {
    return rank < 0;
  }
  return Date.parse(deadlineOf(a)) < Date.parse(deadlineOf(b));
}

/**
 * Le décompte : jusqu'à la CLÔTURE d'une opération ouverte (« Dernier jour » le
 * jour même), jusqu'à l'OUVERTURE d'une annoncée ; rien pour une close.
 */
function countdownOf(operation: ShopOperationView, now: Date, copy: ClientCopy): string | null {
  if (operation.state === 'closed') {
    return null;
  }
  const days = parisDaysUntil(deadlineOf(operation), now);
  if (days === null) {
    return null;
  }
  if (days === 0) {
    return operation.state === 'open' ? copy.shop.operationBadgeLastDay : null;
  }
  return fill(copy.shop.operationBadgeDays, { days: String(days) });
}

function badgeOf(
  operation: ShopOperationView,
  locale: LocaleCode,
  copy: ClientCopy,
): string | null {
  switch (operation.state) {
    case 'open':
      return null;
    case 'announced':
      return fill(copy.shop.operationOpensOn, { date: shortDate(operation.orderFrom, locale) });
    case 'closed':
      return copy.shop.operationClosed;
  }
}

function imageOf(operation: ShopOperationView): DatedEventImage | null {
  if (operation.image === null) {
    return null;
  }
  const { url, alt } = operation.image;
  return { src: sizedMedia(url, SHEET_WIDTHS[0]), srcset: mediaSrcset(url, SHEET_WIDTHS), alt };
}

/** La carte d'une opération, lue à `now` dans la langue de l'interface. */
export function datedEventOf(
  operation: ShopOperationView,
  now: Date,
  locale: LocaleCode,
  copy: ClientCopy,
): DatedEvent {
  return {
    badge: badgeOf(operation, locale, copy),
    countdown: countdownOf(operation, now, copy),
    title: operationText(operation.name, locale),
    dates: `${copy.product.operationPickup} ${pickupSpan(operation, locale, copy)}`,
    teaser: operation.lede === null ? '' : operationText(operation.lede, locale),
    image: imageOf(operation),
    route: SHOP_ROUTE,
    queryParams: { [SHELF_PARAM]: operationShelfId(operation.key) },
  };
}
