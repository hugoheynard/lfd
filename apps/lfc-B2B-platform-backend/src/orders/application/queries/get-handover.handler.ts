import type { OrderHandoverView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { HandoverTokenNotFoundError } from "../../domain/errors/order-errors.js";
import { OrderReader, type HandoverOrder } from "../../domain/ports/order.reader.js";
import { handoverBlocker } from "../../domain/services/handover.js";
import { GetHandoverQuery } from "./get-handover.query.js";

/**
 * L'écran de comptoir : ce que le staff a sous les yeux entre le scan et le
 * bouton de confirmation.
 *
 * Il **répond toujours** quand le jeton existe, même si la remise est
 * impossible : le refus part avec la commande (`blockedReason`), pas à la place.
 * Une erreur sèche ferait disparaître de l'écran le numéro et le client — les
 * deux seules choses avec lesquelles on peut décrocher un téléphone.
 */
@QueryHandler(GetHandoverQuery)
export class GetHandoverHandler implements IQueryHandler<GetHandoverQuery, OrderHandoverView> {
  constructor(private readonly orders: OrderReader) {}

  async execute(query: GetHandoverQuery): Promise<OrderHandoverView> {
    const order = await this.orders.findByHandoverToken(query.token);
    if (order === null) {
      throw new HandoverTokenNotFoundError();
    }
    return toHandoverView(order);
  }
}

/** Projette l'état lu en vue de comptoir, refus compris. */
export function toHandoverView(order: HandoverOrder): OrderHandoverView {
  return {
    orderId: order.orderId,
    orderNumber: order.orderNumber,
    customerLabel: order.customerLabel,
    placedAt: order.placedAt.toISOString(),
    requestedDeliveryDate:
      order.requestedDeliveryDate === null
        ? null
        : order.requestedDeliveryDate.toISOString().slice(0, 10),
    pickupLabel: order.pickupLabel,
    totalUnits: order.lines.reduce((sum, line) => sum + line.quantity, 0),
    lines: order.lines,
    handedOverAt: order.handedOverAt === null ? null : order.handedOverAt.toISOString(),
    handedOverBy: order.handedOverBy,
    blockedReason: handoverBlocker(order),
  };
}
