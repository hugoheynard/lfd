import type { PortfolioMetricsView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PortfolioMetricsReader } from "../domain/ports/portfolio-metrics.reader.js";
import { classifyPulse, type AccountRevenueWindows } from "../domain/portfolio-pulse.js";
import { REVENUE_ORDER_STATUSES } from "../domain/revenue-scope.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 30;

/**
 * L'état du portefeuille, en **quatre lectures** — jamais une par compte.
 *
 * Le classement des comptes (croissance / stable / baisse) est fait par une
 * fonction **pure** (`classifyPulse`) : le SQL rend deux sommes par société, le
 * domaine tranche. C'est la bande de stabilité qu'on voudra bouger en premier, et
 * elle doit pouvoir l'être sans toucher à une requête.
 */
@Injectable()
export class PrismaPortfolioMetricsReader extends PortfolioMetricsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(now: Date): Promise<PortfolioMetricsView> {
    const currentStart = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);
    const previousStart = new Date(now.getTime() - 2 * WINDOW_DAYS * DAY_MS);

    const [activeCompanies, activatedLast30d, failedPayments, current, previous] =
      await Promise.all([
        this.prisma.company.count({ where: { status: "active" } }),
        this.prisma.company.count({ where: { activatedAt: { gte: currentStart } } }),
        // Le compte des COMMANDES, pas des sociétés : deux échecs sur le même
        // compte sont deux relances à passer.
        this.prisma.order.count({ where: { paymentStatus: "failed" } }),
        this.revenueByCompany(currentStart, now),
        this.revenueByCompany(previousStart, currentStart),
      ]);

    return {
      activeCompanies,
      activatedLast30d,
      pulse: classifyPulse(joinWindows(previous, current)),
      failedPayments,
    };
  }

  /**
   * Le CA **TTC encaissable** par société sur une fenêtre. Les commandes zéro
   * friction (`companyId` nul) en sont écartées par construction : elles
   * n'appartiennent à aucun compte, donc à aucune tendance de compte.
   */
  private async revenueByCompany(from: Date, to: Date): Promise<Map<string, number>> {
    const rows = await this.prisma.order.groupBy({
      by: ["companyId"],
      where: {
        companyId: { not: null },
        createdAt: { gte: from, lt: to },
        status: { in: [...REVENUE_ORDER_STATUSES] },
      },
      _sum: { totalCents: true },
    });
    return new Map(
      rows.flatMap((row) =>
        row.companyId === null ? [] : [[row.companyId, row._sum.totalCents ?? 0]],
      ),
    );
  }
}

/** Les deux fenêtres, recollées par société — l'absence d'un côté vaut zéro. */
function joinWindows(
  previous: ReadonlyMap<string, number>,
  current: ReadonlyMap<string, number>,
): AccountRevenueWindows[] {
  const companies = new Set([...previous.keys(), ...current.keys()]);
  return [...companies].map((companyId) => ({
    previousCents: previous.get(companyId) ?? 0,
    currentCents: current.get(companyId) ?? 0,
  }));
}
