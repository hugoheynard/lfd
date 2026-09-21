import type { CustomerOrderLineView, CustomerOrderView } from '@lfd/contracts';

import type { LocaleCode } from '../client-locale.service';

/**
 * **Ce que dit la carte « Ou reprenez »** de la dernière commande.
 *
 * Des fonctions PURES, hors de l'écran : c'est ici qu'on décide qu'une commande
 * de dix jours ne se dit pas « comme mardi dernier », et ça doit se prouver sans
 * monter un composant.
 */

/** Au-delà, nommer un jour de la semaine désignerait le mauvais. */
const RECENT_DAYS = 7;

/** Le nombre de lignes que la sous-ligne NOMME ; le reste se compte. */
const NAMED_LINES = 3;

/**
 * Le jour de la semaine d'une commande, ou `null` si elle est trop ancienne.
 *
 * 🔴 `null` au-delà d'une semaine, et c'est tout l'objet de cette fonction :
 * « comme mardi dernier » pour une commande d'il y a trois semaines désigne un
 * mardi que le client n'a pas vécu. La carte dit alors « votre dernière
 * commande », qui reste vrai quel que soit le calendrier.
 *
 * `now` est passé plutôt que lu : sans lui, ce test serait vert jusqu'au jour où
 * il ne le serait plus.
 */
export function orderWeekday(placedAt: string, now: Date, locale: LocaleCode): string | null {
  const placed = new Date(placedAt);
  if (Number.isNaN(placed.getTime())) {
    return null;
  }
  const days = (now.getTime() - placed.getTime()) / 86_400_000;
  if (days < 0 || days >= RECENT_DAYS) {
    return null;
  }
  return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(placed);
}

/**
 * Les lignes d'une commande, en une phrase : « 2 traditions, 4 croissants +2 ».
 *
 * Trois nommées, le reste compté. Couper à trois sans le dire ferait croire que
 * la commande en tenait trois — et c'est le nombre, pas la liste, qui décide si
 * on reprend la même chose.
 */
export function orderLinesSummary(
  lines: readonly CustomerOrderLineView[],
  more: (count: number) => string,
): string {
  const named = lines
    .slice(0, NAMED_LINES)
    .map((line) => `${line.quantity} ${line.productName}`)
    .join(', ');
  const rest = lines.length - NAMED_LINES;
  return rest > 0 ? `${named} ${more(rest)}` : named;
}

/**
 * Comment la commande a été servie : « retrait au Labo », ou la livraison.
 *
 * ⚠️ Le point de retrait vient du SNAPSHOT de la commande, jamais du carnet
 * d'aujourd'hui : c'est là qu'elle a été retirée, même si la maison a fermé
 * depuis. Sans libellé ni ville dans le snapshot, on ne nomme pas le lieu
 * plutôt que d'en nommer un autre.
 */
export function orderPlaceLabel(
  order: CustomerOrderView,
  pickup: (place: string) => string,
  delivery: string,
): string {
  if (order.fulfillmentMethod === 'delivery') {
    return delivery;
  }
  const place = order.pickupAddress?.label || order.pickupAddress?.ville || '';
  return place === '' ? '' : pickup(place);
}
