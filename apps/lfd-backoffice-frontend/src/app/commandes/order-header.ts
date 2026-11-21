import { formatOrderDate, fulfillmentLabel } from '@lfd/b2b-ui/order';
import type { AdminOrderView } from '@lfd/contracts';

import { clienteleLabel } from './order-list-filters';

/** L'en-tête du détail d'une commande, déjà mis en mots. */
export interface OrderHeader {
  /** La RÉFÉRENCE : c'est elle qu'on dicte au téléphone. */
  readonly number: string;
  /** Le client — l'enseigne ou la société d'un pro, le nom d'un particulier — ou `null`. */
  readonly name: string | null;
  /**
   * Le badge Pro / Particulier, ou `null` sur une commande d'avant la
   * distinction — on ne le déduit pas de `companyId` après coup.
   */
  readonly clientele: { readonly label: string; readonly variant: 'info' | 'neutral' } | null;
  /** « Retrait · La Folie Bakery, le 22 novembre 2026 » : le mode, puis son jour. */
  readonly fulfillment: string;
}

/**
 * Met en mots l'en-tête du détail. Une commande sans jour demandé dit son mode
 * seul — sans jour inventé.
 */
export function orderHeader(
  order: Pick<
    AdminOrderView,
    | 'orderNumber'
    | 'fulfillmentMethod'
    | 'pickupAddress'
    | 'requestedDeliveryDate'
    | 'customerLabel'
    | 'clientele'
  >,
): OrderHeader {
  const mode = fulfillmentLabel(order.fulfillmentMethod, order.pickupAddress?.label);
  const day = order.requestedDeliveryDate;
  const label = clienteleLabel(order.clientele);
  const name = order.customerLabel.trim();
  return {
    number: order.orderNumber,
    name: name === '' ? null : name,
    // Mêmes teintes que la liste (`orders-table.html`) : un pro se repère d'un coup d'œil.
    clientele:
      label === null ? null : { label, variant: order.clientele === 'pro' ? 'info' : 'neutral' },
    fulfillment: day === null ? mode : `${mode}, le ${formatOrderDate(day)}`,
  };
}
