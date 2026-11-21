import { Injectable } from "@nestjs/common";

import { isUniqueViolation } from "../../../platform/database/json-columns.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { OrderReviews } from "../domain/entities/order-reviews.js";
import {
  OrderNotReviewedError,
  OrderReviewRaceError,
} from "../domain/errors/order-review-errors.js";
import { OrderReviewsRepository } from "../domain/ports/order-reviews.repository.js";
import { loadOrderReviews } from "./order-reviews.rows.js";

/**
 * L'adaptateur du registre des visas. `load` prend le verrou de la ligne
 * `orders` : deux commerciaux qui visent ensemble se suivent, et le second
 * lit le visa du premier — l'agrégat le refuse en le datant. L'index unique
 * partiel reste le dernier gardien, traduit en refus nommé.
 */
@Injectable()
export class PrismaOrderReviewsRepository extends OrderReviewsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(orderId: string): Promise<OrderReviews | null> {
    await this.prisma.$queryRaw`
      SELECT "id" FROM "public"."orders" WHERE "id" = ${orderId} FOR UPDATE`;
    return loadOrderReviews(this.prisma, orderId);
  }

  async save(reviews: OrderReviews): Promise<void> {
    const { created, withdrawn } = reviews.changes();
    const orderId = reviews.order.orderId;
    if (withdrawn !== null && withdrawn.withdrawn !== null) {
      // Conditionné sur « encore en cours » : un retrait concurrent ne se
      // réécrit pas, et ne garde que son premier auteur.
      const { count } = await this.prisma.orderReview.updateMany({
        where: { id: withdrawn.id, orderId, withdrawnAt: null },
        data: {
          withdrawnAt: withdrawn.withdrawn.at,
          withdrawnByStaffId: withdrawn.withdrawn.byStaffId,
        },
      });
      if (count === 0) {
        throw new OrderNotReviewedError(reviews.order.orderNumber);
      }
    }
    if (created !== null) {
      try {
        await this.prisma.orderReview.create({
          data: {
            id: created.id,
            orderId,
            reviewedRevision: created.reviewedRevision,
            reviewedByStaffId: created.reviewedByStaffId,
            reviewedAt: created.reviewedAt,
            note: created.note,
          },
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new OrderReviewRaceError(orderId);
        }
        throw error;
      }
    }
  }
}
