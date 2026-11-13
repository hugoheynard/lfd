import { Injectable } from "@nestjs/common";
import type { AcquisitionMetricsView } from "@lfd/contracts";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Clock } from "../../../platform/time/clock.js";
import { withoutAbandonedAttempts } from "../domain/abandoned-attempts.js";
import { ACTIVITY_TYPES } from "../domain/activity-event.js";
import { computeAcquisitionMetrics } from "../domain/acquisition-metrics.js";
import { dayKey, dayRange, weekStarts } from "../domain/growth-stats.js";
import { AcquisitionMetricsReader } from "../domain/ports/acquisition-metrics.reader.js";
import { abandonedAttemptOrderIds } from "./abandoned-attempt-orders.js";

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
 * reste la vraie première, tentatives de carte abandonnées écartées) et les **résiliations confirmées** de la fenêtre, puis
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

    const [rows, terminations, abandoned] = await Promise.all([
      this.prisma.activityEvent.findMany({
        where: { type: { in: TYPES } },
        select: { type: true, subjectId: true, occurredAt: true, payload: true },
      }),
      this.prisma.companyTermination.findMany({
        where: { outcome: "confirmed", createdAt: { gte: start } },
        select: { createdAt: true },
      }),
      abandonedAttemptOrderIds(this.prisma),
    ]);
    const events = withoutAbandonedAttempts(
      rows.map((row) => ({ ...row, payload: asRecord(row.payload) })),
      abandoned,
    );

    return computeAcquisitionMetrics(
      window,
      events,
      terminations.map((t) => t.createdAt),
      now,
    );
  }
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
