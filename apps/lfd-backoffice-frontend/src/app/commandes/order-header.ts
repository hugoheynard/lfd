import { formatOrderDate } from '@lfd/b2b-ui/order';
import type { OrderView } from '@lfd/contracts';

import { methodLabel } from './order-list-filters';

/** L'en-tête du détail d'une commande, déjà mis en mots. */
export interface OrderHeader {
  /** La RÉFÉRENCE : c'est elle qu'on dicte au téléphone. */
  readonly number: string;
  /** « Retrait le 12/10/2026 — Boulangerie Martin » : le mode, son jour, le client. */
  readonly subtitle: string;
}

/**
 * Met en mots l'en-tête du détail. Une commande d'avant l'obligation n'a pas
 * de jour : le mode se dit seul, sans jour inventé.
 */
export function orderHeader(
  order: Pick<
    OrderView,
    'orderNumber' | 'fulfillmentMethod' | 'requestedDeliveryDate' | 'customerLabel'
  >,
): OrderHeader {
  const mode = methodLabel(order.fulfillmentMethod);
  const when =
    order.requestedDeliveryDate === null
      ? mode
      : `${mode} le ${formatOrderDate(order.requestedDeliveryDate)}`;
  return { number: order.orderNumber, subtitle: `${when} — ${order.customerLabel}` };
}
