import { Injectable } from "@nestjs/common";
import type { MarketVolumeView } from "@lfd/contracts";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Clock } from "../../../platform/time/clock.js";
import { weekStart, weekStarts } from "../domain/growth-stats.js";
import { computeMarketVolume } from "../domain/market-volume.js";
import { MarketConfigStore } from "../domain/ports/market-config.store.js";
import { MarketVolumeReader } from "../domain/ports/market-volume.reader.js";
import { REVENUE_ORDER_STATUSES } from "../domain/revenue-scope.js";

const WINDOW_WEEKS = 13;

/**
 * Adaptateur Prisma **marché vs volume** : le marché = somme des `addressable` (config,
 * ≈ constant), le volume = le CA (TTC) **de la semaine** — périodique, pas cumulé, pour
 * que la courbe puisse baisser. Fenêtre alignée sur le dashboard.
 */
@Injectable()
export class PrismaMarketVolumeReader extends MarketVolumeReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: MarketConfigStore,
    private readonly clock: Clock,
  ) {
    super();
  }

  async load(): Promise<MarketVolumeView> {
    const now = this.clock.now();
    const window = weekStarts(now, WINDOW_WEEKS);
    const first = window[0];
    const start = first !== undefined ? new Date(`${first}T00:00:00.000Z`) : now;
    const config = await this.store.load();
    const marketActors = config.zones.reduce((sum, z) => sum + z.addressable, 0);

    const orders = await this.prisma.order.findMany({
      where: { status: { in: [...REVENUE_ORDER_STATUSES] } },
      select: { createdAt: true, totalCents: true },
    });
    const weeklyCents = new Map<string, number>();
    for (const order of orders) {
      if (order.createdAt < start) {
        continue;
      }
      const w = weekStart(order.createdAt);
      weeklyCents.set(w, (weeklyCents.get(w) ?? 0) + order.totalCents);
    }
    return computeMarketVolume(window, weeklyCents, marketActors, now);
  }
}
