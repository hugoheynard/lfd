import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { Basket } from "../../basket/domain/entities/basket.js";
import type { IsoDate } from "../../basket/domain/value-objects/iso-date.js";
import { BASKET_INCLUDE, basketFromRow } from "../../basket/infrastructure/basket-row.mapper.js";
import { BasketsBehindPlan } from "../domain/ports/baskets-behind-plan.js";

/** Les paniers servis dont la création à l'avance n'atteint pas l'horizon. */
@Injectable()
export class PrismaBasketsBehindPlan extends BasketsBehindPlan {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async behind(today: IsoDate, horizon: IsoDate, limit: number): Promise<readonly Basket[]> {
    const rows = await this.prisma.basket.findMany({
      where: {
        status: "active",
        companyId: { not: null },
        OR: [{ endDate: null }, { endDate: { gte: today.toUtcDate() } }],
        AND: [{ OR: [{ plannedUntil: null }, { plannedUntil: { lt: horizon.toUtcDate() } }] }],
      },
      orderBy: [{ plannedUntil: { sort: "asc", nulls: "first" } }, { id: "asc" }],
      take: limit,
      include: BASKET_INCLUDE,
    });
    return rows.map(basketFromRow);
  }
}
