import type { AdminSubscriptionRow, SubscriptionView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CANCELLED_BASKET } from "../domain/entities/basket.js";
import { type BasketBuyerName, BasketReader } from "../domain/ports/basket.reader.js";
import type { IsoDate } from "../domain/value-objects/iso-date.js";
import { basketViewSelect, toAdminOccurrences, toSubscriptionView } from "./basket-view.mapper.js";

/**
 * Adaptateur Prisma de lecture des paniers, plus récents d'abord, chacun avec
 * ses échéances depuis `since` — une requête par liste, sans N+1.
 */
@Injectable()
export class PrismaBasketReader extends BasketReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listForBuyer(buyerUserId: string, since: IsoDate): Promise<readonly SubscriptionView[]> {
    const rows = await this.prisma.basket.findMany({
      where: { buyerUserId, status: { not: CANCELLED_BASKET } },
      orderBy: { createdAt: "desc" },
      select: basketViewSelect(since),
    });
    return rows.map(toSubscriptionView);
  }

  async listForBuyers(
    buyers: readonly BasketBuyerName[],
    since: IsoDate,
  ): Promise<readonly AdminSubscriptionRow[]> {
    const names = new Map(buyers.map((buyer) => [buyer.userId, buyer.name]));
    const rows = await this.prisma.basket.findMany({
      where: { buyerUserId: { in: [...names.keys()] }, status: { not: CANCELLED_BASKET } },
      orderBy: { createdAt: "desc" },
      select: basketViewSelect(since),
    });
    return rows.map((row) => ({
      ...toSubscriptionView(row),
      occurrences: toAdminOccurrences(row),
      placedByUserId: row.buyerUserId,
      placedByName: names.get(row.buyerUserId) ?? row.buyerUserId,
    }));
  }
}
