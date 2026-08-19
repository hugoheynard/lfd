import { Injectable } from "@nestjs/common";
import type { OrderMetricsView } from "@lfd/contracts";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Clock } from "../../../platform/time/clock.js";
import { dayKey, dayRange, weekStarts } from "../domain/growth-stats.js";
import { concentrationOf } from "../domain/growth-stats-advanced.js";
import { computeOrderMetrics, type OrderDayTally } from "../domain/order-metrics.js";
import { OrderMetricsReader } from "../domain/ports/order-metrics.reader.js";
import { goodsCents, REVENUE_ORDER_STATUSES } from "../domain/revenue-scope.js";

const WINDOW_WEEKS = 13;

/**
 * Adaptateur Prisma des **métriques de commande dans le temps** : agrège TOUTES les
 * commandes de la fenêtre (y compris zéro-friction sans société) par jour — CA (TTC),
 * nombre, et répartition récurrent/unique selon `fromSubscriptionId` — puis délègue au
 * calcul pur. Fenêtre au grain jour, calée sur le premier lundi des 13 semaines.
 */
@Injectable()
export class PrismaOrderMetricsReader extends OrderMetricsReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {
    super();
  }

  async load(): Promise<OrderMetricsView> {
    const now = this.clock.now();
    const weeks = weekStarts(now, WINDOW_WEEKS);
    const first = weeks[0] ?? dayKey(now);
    const window = dayRange(first, dayKey(now));
    const start = new Date(`${first}T00:00:00.000Z`);

    const orders = await this.prisma.order.findMany({
      where: { createdAt: { gte: start }, status: { in: [...REVENUE_ORDER_STATUSES] } },
      select: {
        createdAt: true,
        totalCents: true,
        subtotalCents: true,
        discountCents: true,
        fromSubscriptionId: true,
        companyId: true,
        placedByUserId: true,
      },
    });
    const byDay = new Map<string, OrderDayTally>();
    // Volume par ACHETEUR : la société si la commande y est rattachée, sinon la
    // personne (zéro-friction). Les deux espaces d'ids sont préfixés pour ne jamais
    // se confondre dans la même distribution.
    const byBuyer = new Map<string, number>();
    for (const order of orders) {
      const buyer =
        order.companyId !== null ? `company:${order.companyId}` : `user:${order.placedByUserId}`;
      byBuyer.set(buyer, (byBuyer.get(buyer) ?? 0) + order.totalCents);
      const day = dayKey(order.createdAt);
      const prev = byDay.get(day);
      const recurring = order.fromSubscriptionId !== null ? order.totalCents : 0;
      byDay.set(day, {
        caCents: (prev?.caCents ?? 0) + order.totalCents,
        caGoodsCents: (prev?.caGoodsCents ?? 0) + goodsCents(order),
        orders: (prev?.orders ?? 0) + 1,
        caRecurringCents: (prev?.caRecurringCents ?? 0) + recurring,
        caOneShotCents: (prev?.caOneShotCents ?? 0) + (order.totalCents - recurring),
      });
    }

    return computeOrderMetrics(window, byDay, concentrationOf(byBuyer), now);
  }
}
