import { cartAdjustmentSchema } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../../platform/database/prisma.service.js";
import {
  frozenLabelOf,
  REVISABLE_ORDER_DISCOUNTS_SELECT,
  revisableDiscountOf,
} from "../../revision/infrastructure/revisable-discounts.columns.js";
import {
  REVISABLE_LINE_SELECT,
  revisableLineSnapshotOf,
} from "../../revision/infrastructure/revisable-order.row.js";
import {
  BackorderReplayReader,
  type BackorderOriginReplay,
} from "../domain/ports/backorder-replay.reader.js";

/**
 * Le prix d'origine d'un reliquat, relu sur la commande d'origine avec les
 * colonnes et les mappers de la révision : une ligne figée et une remise
 * active se lisent ici comme la révision les lit, pour un rejeu identique.
 */
@Injectable()
export class PrismaBackorderReplayReader extends BackorderReplayReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async replayOf(originOrderId: string): Promise<BackorderOriginReplay | null> {
    const row = await this.prisma.order.findUnique({
      where: { id: originOrderId },
      select: {
        id: true,
        orderNumber: true,
        discountPromotionId: true,
        discountAdjustment: true,
        discountLabel: true,
        discountCents: true,
        discountTtcCents: true,
        lines: { select: REVISABLE_LINE_SELECT, orderBy: { sku: "asc" } },
        discounts: REVISABLE_ORDER_DISCOUNTS_SELECT,
      },
    });
    if (row === null) {
      return null;
    }
    return {
      originOrderNumber: row.orderNumber,
      lines: row.lines.map(revisableLineSnapshotOf),
      replayable: {
        activeDiscounts: row.discounts.map((discount) =>
          revisableDiscountOf(row.id, discount, row.lines),
        ),
        discountPromotionId: row.discountPromotionId,
        discountAdjustment:
          row.discountAdjustment === null
            ? null
            : cartAdjustmentSchema.parse(row.discountAdjustment),
        discountLabel: frozenLabelOf(row.discountLabel),
        discountCents: row.discountCents,
        discountTtcCents: row.discountTtcCents,
      },
    };
  }
}
