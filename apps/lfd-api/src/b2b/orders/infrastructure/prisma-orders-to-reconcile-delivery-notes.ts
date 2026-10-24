import { Injectable } from "@nestjs/common";

import { OrderStatus } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  OrdersToReconcileDeliveryNotes,
  type DeliveryNoteOrderProgress,
} from "../domain/ports/order-progress-for-delivery-note.js";
import {
  DELIVERY_NOTE_PROGRESS_SELECT,
  toDeliveryNoteOrderProgress,
} from "./delivery-note-order-progress.row.js";

/**
 * Les statuts que le réconciliateur passe en revue. `placed` n'y est pas : son
 * BL prévu attend la re-clôture (E1), et il n'y a rien à rattraper.
 */
const RECONCILED_STATUSES = [
  OrderStatus.confirmed,
  OrderStatus.ready,
  OrderStatus.fulfilled,
  OrderStatus.cancelled,
  OrderStatus.draft,
  OrderStatus.in_production,
];

/** L'adaptateur Prisma du parcours du réconciliateur des BL (plan E2, § 8.2). */
@Injectable()
export class PrismaOrdersToReconcileDeliveryNotes extends OrdersToReconcileDeliveryNotes {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async pageAfter(
    afterId: string | null,
    limit: number,
  ): Promise<readonly DeliveryNoteOrderProgress[]> {
    const rows = await this.prisma.order.findMany({
      where: {
        status: { in: RECONCILED_STATUSES },
        ...(afterId === null ? {} : { id: { gt: afterId } }),
      },
      orderBy: { id: "asc" },
      take: limit,
      select: DELIVERY_NOTE_PROGRESS_SELECT,
    });
    return rows.map(toDeliveryNoteOrderProgress);
  }

  async lockProgressOf(orderId: string): Promise<DeliveryNoteOrderProgress | null> {
    // Le verrou d'abord, la lecture ensuite : un geste concurrent sur la même
    // commande attend, puis le réconciliateur relit ce qu'il a écrit.
    const locked = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "public"."orders"
      WHERE "id" = ${orderId}
      FOR UPDATE`;
    if (locked.length === 0) {
      return null;
    }
    const row = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: DELIVERY_NOTE_PROGRESS_SELECT,
    });
    return toDeliveryNoteOrderProgress(row);
  }
}
