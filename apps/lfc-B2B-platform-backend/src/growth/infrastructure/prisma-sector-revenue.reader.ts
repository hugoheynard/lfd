import { Injectable } from "@nestjs/common";
import type { SectorRevenueView } from "@lfd/contracts";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { Clock } from "../../infra/time/clock.js";
import { weekStart, weekStarts } from "../domain/growth-stats.js";
import { computeSectorRevenue } from "../domain/sector-revenue.js";
import { MarketConfigStore } from "../domain/ports/market-config.store.js";
import { SectorRevenueReader } from "../domain/ports/sector-revenue.reader.js";

const WINDOW_WEEKS = 13;

/**
 * Adaptateur Prisma du **CA par secteur NAF dans le temps** : agrège le CA (TTC) des
 * commandes **rattachées à une société** par (semaine × `nafCode`), sur la fenêtre du
 * dashboard, puis délègue à `computeSectorRevenue` (pur) avec les libellés NAF ciblés.
 */
@Injectable()
export class PrismaSectorRevenueReader extends SectorRevenueReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: MarketConfigStore,
    private readonly clock: Clock,
  ) {
    super();
  }

  async load(): Promise<SectorRevenueView> {
    const now = this.clock.now();
    const window = weekStarts(now, WINDOW_WEEKS);
    const first = window[0];
    const start = first !== undefined ? new Date(`${first}T00:00:00.000Z`) : now;
    const config = await this.store.load();
    const targeted = new Set(config.nafCodes.map((n) => n.code));

    const orders = await this.prisma.order.findMany({
      where: { createdAt: { gte: start }, companyId: { not: null } },
      select: { createdAt: true, totalCents: true, company: { select: { nafCode: true } } },
    });
    const weeklyByNaf = new Map<string, Map<string, number>>();
    for (const order of orders) {
      const code = order.company?.nafCode ?? "";
      if (code === "" || !targeted.has(code)) {
        continue;
      }
      const week = weekStart(order.createdAt);
      const byNaf = weeklyByNaf.get(week) ?? new Map<string, number>();
      byNaf.set(code, (byNaf.get(code) ?? 0) + order.totalCents);
      weeklyByNaf.set(week, byNaf);
    }

    const nafLabels = new Map(config.nafCodes.map((n) => [n.code, n.label]));
    return computeSectorRevenue(window, nafLabels, weeklyByNaf, now);
  }
}
