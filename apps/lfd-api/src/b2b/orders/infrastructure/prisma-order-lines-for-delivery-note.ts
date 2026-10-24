import { Injectable } from "@nestjs/common";

import { OrderStatus } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  OrderLinesForDeliveryNote,
  type DeliveryNoteOrder,
} from "../domain/ports/order-lines-for-delivery-note.js";

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
      select: {
        id: true,
        orderNumber: true,
        lines: {
          orderBy: { id: "asc" },
          select: {
            sku: true,
            productNameSnapshot: true,
            unitPriceMillicents: true,
            vatRate: true,
            quantity: true,
            lineTotalCents: true,
            unitPriceTtcCents: true,
            lineTotalTtcCents: true,
          },
        },
      },
    });
    return rows.map((row) => ({
      orderId: row.id,
      orderNumber: row.orderNumber,
      lines: row.lines.map(({ productNameSnapshot, vatRate, ...line }) => ({
        ...line,
        productName: productNameSnapshot,
        vatRate: vatRate.toNumber(),
      })),
    }));
  }
}
