import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderBasketDiscountsReader } from "../domain/ports/order-basket-discounts.reader.js";
import type { FrozenBasketDiscount } from "../domain/services/frozen-basket-discounts.js";
import { ACTIVE_ORDER_DISCOUNTS_SELECT, basketDiscountsOfRow } from "./order-discounts.columns.js";

/** Les remises figées d'une commande, par le client routé (transaction de l'appelant). */
@Injectable()
export class PrismaOrderBasketDiscountsReader extends OrderBasketDiscountsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /** @throws {FrozenAdjustmentUnreadableError} un ajustement figé illisible. */
  async discountsOf(orderId: string): Promise<readonly FrozenBasketDiscount[]> {
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        discountPromotionId: true,
        discountAdjustment: true,
        discounts: ACTIVE_ORDER_DISCOUNTS_SELECT,
      },
    });
    return row === null ? [] : basketDiscountsOfRow(orderId, row);
  }
}
