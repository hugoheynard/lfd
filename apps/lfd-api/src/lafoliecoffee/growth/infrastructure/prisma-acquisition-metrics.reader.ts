import { Injectable } from "@nestjs/common";
import type { AcquisitionMetricsView } from "@lfd/contracts";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Clock } from "../../../platform/time/clock.js";
import { ACTIVITY_TYPES } from "../domain/activity-event.js";
import { computeAcquisitionMetrics } from "../domain/acquisition-metrics.js";
import { dayKey, dayRange, weekStarts } from "../domain/growth-stats.js";
import { AcquisitionMetricsReader } from "../domain/ports/acquisition-metrics.reader.js";

const WINDOW_WEEKS = 13;

/** Types de journal nourrissant l'acquisition (le churn vient de `company_terminations`). */
const TYPES = [
  ACTIVITY_TYPES.userRegistered,
  ACTIVITY_TYPES.orderPlaced,
  ACTIVITY_TYPES.leadCaptured,
];

/**
 * Adaptateur Prisma de l'**acquisition & churn au grain jour** : lit le journal (les
 * `order.placed` sur TOUT l'historique, pour que la « 1re commande » d'une personne
 * reste la vraie première) et les **résiliations confirmées** de la fenêtre, puis
 * délègue au calcul pur. Fenêtre jour calée sur le premier lundi des 13 semaines.
 */
@Injectable()
export class PrismaAcquisitionMetricsReader extends AcquisitionMetricsReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {
    super();
  }

  async load(): Promise<AcquisitionMetricsView> {
    const now = this.clock.now();
    const weeks = weekStarts(now, WINDOW_WEEKS);
    const first = weeks[0] ?? dayKey(now);
    const window = dayRange(first, dayKey(now));
    const start = new Date(`${first}T00:00:00.000Z`);

    const [events, terminations] = await Promise.all([
      this.prisma.activityEvent.findMany({
        where: { type: { in: TYPES } },
        select: { type: true, subjectId: true, occurredAt: true },
      }),
      this.prisma.companyTermination.findMany({
        where: { outcome: "confirmed", createdAt: { gte: start } },
        select: { createdAt: true },
      }),
    ]);

    return computeAcquisitionMetrics(
      window,
      events,
      terminations.map((t) => t.createdAt),
      now,
    );
  }
}
