import { type CustomerOrderView, instantToLocal, type PickupAddressView } from '@lfd/contracts';

import { fill } from '../copy/client-copy.service';
import { discountLabel } from '../shop/pickup-discount';

/**
 * Le bloc « Votre compte pro » de l'accueil, calculé sur les vraies données.
 *
 * 🔴 **Il était écrit en dur** jusqu'au 2026-09-15 : « −10 % » de remise au
 * Labo, « 312,40 € » d'encours et un KBIS « En cours », les mêmes pour tous les
 * clients. La remise contredisait celle du back-office (20 %), et l'encours
 * était celui de personne.
 */

/** Une ligne de remise : un point de retrait remisé, et ce qu'il remet. */
export interface DiscountRow {
  readonly id: string;
  readonly label: string;
  readonly value: string;
}

/**
 * Une ligne par point **remisé**, dans l'ordre du serveur.
 *
 * Par point et non « la meilleure » : le libellé nommait « au Labo », et un
 * client qui retire au village doit lire ce que SON point lui remet. Un point
 * sans remise n'a pas de ligne — « −0 % » ne dit rien.
 */
export function discountRows(
  points: readonly PickupAddressView[],
  template: string,
): readonly DiscountRow[] {
  return points.flatMap((point) =>
    point.discount === null
      ? []
      : [
          {
            id: point.id,
            label: fill(template, { place: point.label }),
            value: `−${discountLabel(point.discount)}`,
          },
        ],
  );
}

/**
 * **L'encours du mois**, en centimes : ce qui part sur la prochaine facture.
 *
 * Une commande en compte : réglée sur terme (`not_required` — la carte, elle,
 * est encaissée à la commande et ne doit rien), ni annulée ni brouillon, et
 * servie dans le mois de `today`. Le mois est celui de la journée de livraison,
 * pas du clic : c'est elle que le cycle mensuel facture.
 *
 * `today` est un jour `AAAA-MM-JJ` d'Europe/Paris, passé par l'appelant pour que
 * le calcul reste pur.
 */
export function monthOutstandingCents(orders: readonly CustomerOrderView[], today: string): number {
  const month = today.slice(0, MONTH_LENGTH);
  return orders
    .filter((order) => order.paymentStatus === 'not_required')
    .filter((order) => order.status !== 'cancelled' && order.status !== 'draft')
    .filter((order) => dayOf(order).slice(0, MONTH_LENGTH) === month)
    .reduce((sum, order) => sum + order.totalCents, 0);
}

/** `AAAA-MM` : les sept premiers caractères d'un jour ISO. */
const MONTH_LENGTH = 7;

/** La journée de service, ou à défaut le jour de passation, lu à Paris. */
function dayOf(order: CustomerOrderView): string {
  return order.requestedDeliveryDate ?? instantToLocal(new Date(order.placedAt)).day;
}
