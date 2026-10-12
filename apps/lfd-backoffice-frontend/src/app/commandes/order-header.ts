import { formatOrderDate } from '@lfd/b2b-ui/order';
import type { AdminOrderView } from '@lfd/contracts';

import { clienteleLabel, methodLabel } from './order-list-filters';

/** L'en-tête du détail d'une commande, déjà mis en mots. */
export interface OrderHeader {
  /** La RÉFÉRENCE : c'est elle qu'on dicte au téléphone. */
  readonly number: string;
  /** « Retrait le 12/10/2026 — Boulangerie Martin » : le mode, son jour, le client. */
  readonly subtitle: string;
  /**
   * Le badge Pro / Particulier, ou `null` sur une commande d'avant la
   * distinction — on ne le déduit pas de `companyId` après coup.
   */
  readonly clientele: { readonly label: string; readonly variant: 'info' | 'neutral' } | null;
}

/**
 * Met en mots l'en-tête du détail. Une commande d'avant l'obligation n'a pas
 * de jour : le mode se dit seul, sans jour inventé.
 */
export function orderHeader(
  order: Pick<
    AdminOrderView,
    'orderNumber' | 'fulfillmentMethod' | 'requestedDeliveryDate' | 'customerLabel' | 'clientele'
  >,
): OrderHeader {
  const mode = methodLabel(order.fulfillmentMethod);
  const when =
    order.requestedDeliveryDate === null
      ? mode
      : `${mode} le ${formatOrderDate(order.requestedDeliveryDate)}`;
  const label = clienteleLabel(order.clientele);
  return {
    number: order.orderNumber,
    subtitle: `${when} — ${order.customerLabel}`,
    // Mêmes teintes que la liste (`orders-table.html`) : un pro se repère d'un coup d'œil.
    clientele:
      label === null ? null : { label, variant: order.clientele === 'pro' ? 'info' : 'neutral' },
  };
}
