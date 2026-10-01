import { Injectable } from "@nestjs/common";

import {
  type DeliveryOrderState,
  DeliveryOrderStatesReader,
} from "../../../delivery/channels/commerce/index.js";
import { OrderStatus } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";

/**
 * **Où en est la commande d'un arrêt**, rendu par le commerce à la porte
 * (`plan-a-la-porte.md`, AP-D2). Lu par identifiant — la livraison ne connaît
 * une commande que par lui — sans montant ni adresse.
 *
 * `handed_over` : le retrait recopié par le commerce (`handed_over_at`, posé
 * par `markFulfilled`), ou le statut `fulfilled` — l'un sans l'autre ne se
 * produit pas, mais l'un ou l'autre suffit à dire que ce n'est plus à remettre.
 */
@Injectable()
export class PrismaDeliveryOrderStatesReader extends DeliveryOrderStatesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async statesOf(orderIds: readonly string[]): Promise<readonly DeliveryOrderState[]> {
    if (orderIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.order.findMany({
      where: { id: { in: [...orderIds] } },
      select: { id: true, status: true, handedOverAt: true },
    });
    return rows.map((row) => ({ orderId: row.id, state: stateOf(row) }));
  }
}

function stateOf(row: {
  readonly status: OrderStatus;
  readonly handedOverAt: Date | null;
}): DeliveryOrderState["state"] {
  if (row.handedOverAt !== null || row.status === OrderStatus.fulfilled) {
    return "handed_over";
  }
  return row.status === OrderStatus.cancelled ? "cancelled" : "open";
}
