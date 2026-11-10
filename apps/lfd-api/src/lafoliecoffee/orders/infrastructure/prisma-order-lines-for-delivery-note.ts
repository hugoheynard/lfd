import { Injectable } from "@nestjs/common";

import { OrderStatus } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  OrderLinesForDeliveryNote,
  type DeliveryNoteOrder,
} from "../domain/ports/order-lines-for-delivery-note.js";
import {
  DELIVERY_NOTE_LINE_SELECT,
  DELIVERY_NOTE_TERMS_SELECT,
  toDeliveryNoteOrder,
} from "./delivery-note-order.row.js";

/**
 * L'adaptateur Prisma de ce que le bon de livraison lit d'une commande. Le
 * marqueur `confirmedAt = closedAt` est celui de `PrismaOrderPlanRelease` :
 * l'arrêt écrit son PROPRE instant sur ce qu'il confirme.
 */
@Injectable()
export class PrismaOrderLinesForDeliveryNote extends OrderLinesForDeliveryNote {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async confirmedByPlan(
    orderIds: readonly string[],
    closedAt: Date,
  ): Promise<readonly DeliveryNoteOrder[]> {
    const rows = await this.prisma.order.findMany({
      where: { id: { in: [...orderIds] }, status: OrderStatus.confirmed, confirmedAt: closedAt },
      orderBy: { id: "asc" },
      select: { ...DELIVERY_NOTE_TERMS_SELECT, lines: DELIVERY_NOTE_LINE_SELECT },
    });
    return rows.map(toDeliveryNoteOrder);
  }
}
