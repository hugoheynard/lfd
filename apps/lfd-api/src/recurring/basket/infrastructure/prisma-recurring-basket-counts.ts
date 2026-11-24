import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { RecurringBasketCounts } from "../../channels/commerce/recurring-basket-counts.js";

/** `RecurringBasketCounts` sur `recurring.basket` : un `count` par acheteurs. */
@Injectable()
export class PrismaRecurringBasketCounts extends RecurringBasketCounts {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  activeOf(buyerUserIds: readonly string[]): Promise<number> {
    if (buyerUserIds.length === 0) {
      return Promise.resolve(0);
    }
    return this.prisma.basket.count({
      where: { buyerUserId: { in: [...buyerUserIds] }, status: "active" },
    });
  }
}
