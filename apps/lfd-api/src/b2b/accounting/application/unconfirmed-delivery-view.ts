import type { UnconfirmedDeliveryView } from "@lfd/contracts";

import type { UnconfirmedDelivery } from "../domain/ports/unconfirmed-deliveries.reader.js";

/** Le bon à constater tel que l'écran le lit — sans la passation ni le payeur figé, qui ne servent qu'au tri. */
export function unconfirmedDeliveryView(order: UnconfirmedDelivery): UnconfirmedDeliveryView {
  return {
    orderId: order.orderId,
    orderNumber: order.orderNumber,
    companyId: order.companyId,
    companyName: order.companyName,
    serviceDay: order.serviceDay,
    fulfillmentMethod: order.fulfillmentMethod,
    totalCents: order.totalCents,
    awaitingRemainder: order.awaitingRemainder,
  };
}
