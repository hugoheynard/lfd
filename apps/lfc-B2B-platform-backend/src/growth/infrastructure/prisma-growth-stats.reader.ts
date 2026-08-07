import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { Clock } from "../../infra/time/clock.js";
import { ACTIVITY_TYPES } from "../domain/activity-event.js";
import { deriveGrowthStats, type GrowthStatsEvent } from "../domain/growth-stats.js";
import { GrowthStatsReader } from "../domain/ports/growth-stats.reader.js";
import { LeadReader } from "../domain/ports/lead.reader.js";
import type { GrowthStatsView } from "@lfd/contracts";

/** Types de journal nourrissant le dashboard de croissance. */
const STATS_TYPES = [
  ACTIVITY_TYPES.userRegistered,
  ACTIVITY_TYPES.orderPlaced,
  ACTIVITY_TYPES.leadCaptured,
  ACTIVITY_TYPES.companyDeclared,
  ACTIVITY_TYPES.companyStepReached,
  ACTIVITY_TYPES.companyActivated,
];

/**
 * Adaptateur Prisma des stats : lit le journal (`growth.activity_events`) + les
 * leads cold, puis délègue à `deriveGrowthStats` (pur). Instant = `Clock` (fenêtre
 * hebdo déterministe en test).
 */
@Injectable()
export class PrismaGrowthStatsReader extends GrowthStatsReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leads: LeadReader,
    private readonly clock: Clock,
  ) {
    super();
  }

  async load(): Promise<GrowthStatsView> {
    const [rows, leads] = await Promise.all([
      this.prisma.activityEvent.findMany({
        where: { type: { in: STATS_TYPES } },
        select: {
          type: true,
          subjectType: true,
          subjectId: true,
          occurredAt: true,
          actorType: true,
          payload: true,
        },
      }),
      this.leads.list(),
    ]);

    const events: GrowthStatsEvent[] = rows.map((row) => ({
      type: row.type,
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      occurredAt: row.occurredAt,
      actorType: row.actorType,
      payload: asRecord(row.payload),
    }));

    return deriveGrowthStats(events, leads, this.clock.now());
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
