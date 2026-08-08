import { Injectable } from "@nestjs/common";
import type { OrderMetricsView } from "@lfd/contracts";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { Clock } from "../../infra/time/clock.js";
import { dayKey, dayRange, weekStarts } from "../domain/growth-stats.js";
import { computeOrderMetrics, type OrderDayTally } from "../domain/order-metrics.js";
import { OrderMetricsReader } from "../domain/ports/order-metrics.reader.js";

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
      where: { createdAt: { gte: start } },
      select: { createdAt: true, totalCents: true, fromSubscriptionId: true },
    });
    const byDay = new Map<string, OrderDayTally>();
    for (const order of orders) {
      const day = dayKey(order.createdAt);
      const prev = byDay.get(day);
      const recurring = order.fromSubscriptionId !== null ? order.totalCents : 0;
      byDay.set(day, {
        caCents: (prev?.caCents ?? 0) + order.totalCents,
        orders: (prev?.orders ?? 0) + 1,
        caRecurringCents: (prev?.caRecurringCents ?? 0) + recurring,
        caOneShotCents: (prev?.caOneShotCents ?? 0) + (order.totalCents - recurring),
      });
    }

    return computeOrderMetrics(window, byDay, now);
  }
}
