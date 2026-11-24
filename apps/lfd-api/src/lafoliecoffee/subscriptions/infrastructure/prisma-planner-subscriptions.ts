import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { Subscription } from "../domain/entities/subscription.js";
import { PlannerSubscriptions } from "../domain/ports/planner-subscriptions.js";
import type { IsoDate } from "../domain/value-objects/iso-date.js";
import { SUBSCRIPTION_INCLUDE, subscriptionFromRow } from "./prisma-subscription.repository.js";

/** Le statut d'un panier que le planificateur sert. */
const ACTIVE = "active";

/** Adaptateur Prisma : une seule requête, lignes et dérogations comprises. */
@Injectable()
export class PrismaPlannerSubscriptions extends PlannerSubscriptions {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async inHorizon(
    today: IsoDate,
    horizonEnd: IsoDate,
    limit: number,
  ): Promise<readonly Subscription[]> {
    const rows = await this.prisma.subscription.findMany({
      where: {
        status: ACTIVE,
        companyId: { not: null },
        startDate: { lte: horizonEnd.toUtcDate() },
        OR: [{ endDate: null }, { endDate: { gte: today.toUtcDate() } }],
      },
      orderBy: { createdAt: "asc" },
      take: limit,
      include: SUBSCRIPTION_INCLUDE,
    });
    return rows.map((row) => subscriptionFromRow(row));
  }
}
