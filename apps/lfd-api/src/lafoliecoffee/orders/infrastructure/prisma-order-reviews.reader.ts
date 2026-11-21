import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { OrderReviews } from "../domain/entities/order-reviews.js";
import {
  CurrentOrderReviewsReader,
  OrderReviewsReader,
  type CurrentOrderReview,
} from "../domain/ports/order-reviews.reader.js";
import { loadOrderReviews } from "./order-reviews.rows.js";

/** Le registre d'une commande pour son détail — sans verrou : c'est un affichage. */
@Injectable()
export class PrismaOrderReviewsReader extends OrderReviewsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  of(orderId: string): Promise<OrderReviews | null> {
    return loadOrderReviews(this.prisma, orderId);
  }
}

/** Les visas en cours d'une page de commandes, en une requête. */
@Injectable()
export class PrismaCurrentOrderReviewsReader extends CurrentOrderReviewsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async of(orderIds: readonly string[]): Promise<ReadonlyMap<string, CurrentOrderReview>> {
    if (orderIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.orderReview.findMany({
      where: { orderId: { in: [...orderIds] }, withdrawnAt: null },
      select: {
        orderId: true,
        reviewedByStaffId: true,
        reviewedAt: true,
        reviewedRevision: true,
        order: { select: { revision: true } },
      },
    });
    return new Map(
      rows.map((row) => [
        row.orderId,
        {
          reviewedByStaffId: row.reviewedByStaffId,
          reviewedAt: row.reviewedAt,
          revisedSinceReview: row.order.revision > row.reviewedRevision,
        },
      ]),
    );
  }
}
