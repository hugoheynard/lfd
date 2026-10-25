import type { OrderStatus } from "@lfd/contracts";

import { HandoverOrderLock } from "../../channels/commerce/handover-order.lock.js";

/**
 * Le verrou de la commande, tel que le commerce le rendrait : l'état relu
 * sous lui, ou `null` (commande inconnue — le sujet lu avant fait foi). Note
 * chaque prise, pour éprouver qu'elle précède l'écriture.
 */
export class FixedOrderLock extends HandoverOrderLock {
  readonly locked: string[] = [];

  constructor(private readonly status: OrderStatus | null = null) {
    super();
  }

  lockForHandover(orderId: string): Promise<OrderStatus | null> {
    this.locked.push(orderId);
    return Promise.resolve(this.status);
  }
}
