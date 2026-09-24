import type { ShopItemView, ShopOperationText, ShopOperationView } from '@lfd/contracts';

import type { LocaleCode } from '../client-locale.service';
import type { ClientCopy } from '../copy/client-copy.model';
import { fill } from '../copy/client-copy.service';

/**
 * **Les opérations datées, telles que la vitrine les montre** (D8 de
 * `documentation/order/architecture-operations-datees.md`).
 *
 * Un rayon d'opération n'est pas une famille : sa clé est `op:<key>`, la même
 * que le serveur attend pour la vitrine (`GET /shop/storefront/:shelfKey`). Le
 * préfixe est une convention du FIL, d'où sa présence ici plutôt qu'un
 * identifiant inventé par l'écran.
 */
export const OPERATION_SHELF_PREFIX = 'op:';

/** Le fuseau des dates d'ouverture : celui de la maison, pas celui du navigateur. */
const PARIS = 'Europe/Paris';

/** Midi UTC : un jour `AAAA-MM-JJ` reste le même jour dans tous les fuseaux d'Europe. */
const MIDDAY = 'T12:00:00.000Z';

export function operationShelfId(key: string): string {
  return `${OPERATION_SHELF_PREFIX}${key}`;
}

/** La clé d'opération d'un rayon, ou `null` pour une famille ou « Tout ». */
export function operationKeyOf(shelfId: string): string | null {
  return shelfId.startsWith(OPERATION_SHELF_PREFIX)
    ? shelfId.slice(OPERATION_SHELF_PREFIX.length)
    : null;
}

/** Le texte dans la langue de l'interface, le français faute de mieux. */
export function operationText(text: ShopOperationText, locale: LocaleCode): string {
  return (locale === 'fr' ? undefined : text[locale]) ?? text.fr;
}

/** Ce qu'une carte fait de l'état de son opération. */
export interface OperationGate {
  /** Faux : le « + » et l'ajout de la fiche disparaissent. */
  readonly orderable: boolean;
  /** Ce qui les remplace, ou `null` quand rien ne change. */
  readonly label: string | null;
}

const FREE: OperationGate = { orderable: true, label: null };

/**
 * L'état de la carte d'un article. Un article sans `operation` est un article
 * courant : rien ne change pour lui.
 */
export function operationGate(
  item: ShopItemView,
  operation: ShopOperationView | null,
  locale: LocaleCode,
  copy: ClientCopy,
): OperationGate {
  switch (item.operation?.state) {
    case undefined:
    case 'open':
      return FREE;
    case 'closed':
      return { orderable: false, label: copy.shop.operationClosed };
    case 'announced':
      return {
        orderable: false,
        label:
          operation === null
            ? copy.shop.operationNotOpen
            : fill(copy.shop.operationOpensOn, { date: shortDate(operation.orderFrom, locale) }),
      };
  }
}

/** « 15 nov. » — l'instant lu à l'heure de Paris. */
export function shortDate(instant: string, locale: LocaleCode): string {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) {
    return instant;
  }
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: PARIS,
  }).format(date);
}

/** Un jour `AAAA-MM-JJ` en court (« 24 déc. »), ou le seul quantième (« 20 »). */
function shortDay(day: string, locale: LocaleCode, withMonth: boolean): string {
  const date = new Date(`${day}${MIDDAY}`);
  if (Number.isNaN(date.getTime())) {
    return day;
  }
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    ...(withMonth ? { month: 'short' } : {}),
    timeZone: 'UTC',
  }).format(date);
}

/** « du 20 au 24 déc. », « le 24 déc. » — le mois dit une fois quand il est le même. */
export function pickupSpan(
  operation: ShopOperationView,
  locale: LocaleCode,
  copy: ClientCopy,
): string {
  const { pickupFrom, pickupUntil } = operation;
  if (pickupFrom === pickupUntil) {
    return fill(copy.product.operationPickupDay, { day: shortDay(pickupFrom, locale, true) });
  }
  const sameMonth = pickupFrom.slice(0, 7) === pickupUntil.slice(0, 7);
  return fill(copy.product.operationPickupSpan, {
    from: shortDay(pickupFrom, locale, !sameMonth),
    until: shortDay(pickupUntil, locale, true),
  });
}
