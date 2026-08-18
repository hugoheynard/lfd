import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { ACTIVITY_TYPES } from "../domain/activity-event.js";
import type { LeadEvent } from "../domain/lead-score.js";
import { LeadEventSource } from "../domain/ports/lead-event-source.js";

/** Types de journal que le scoring consomme (personne + société). */
const SCORED_TYPES = [
  ACTIVITY_TYPES.userRegistered,
  ACTIVITY_TYPES.orderPlaced,
  ACTIVITY_TYPES.subscriptionCreated,
  ACTIVITY_TYPES.companyDeclared,
  ACTIVITY_TYPES.companyStepReached,
  ACTIVITY_TYPES.companyActivated,
];

/**
 * Adaptateur Prisma : lit **tout** le journal utile au scoring (`growth.activity_events`),
 * et rien d'autre. La dérivation vit dans `deriveLeadScores` (pur) ; ici, on ne
 * fait que projeter les lignes vers la forme d'entrée `LeadEvent`.
 */
@Injectable()
export class PrismaLeadEventSource extends LeadEventSource {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async all(): Promise<LeadEvent[]> {
    const rows = await this.prisma.activityEvent.findMany({
      where: { type: { in: SCORED_TYPES } },
      select: {
        type: true,
        subjectType: true,
        subjectId: true,
        occurredAt: true,
        actorType: true,
        payload: true,
      },
    });

    return rows.map((row) => ({
      type: row.type,
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      occurredAt: row.occurredAt,
      actorType: row.actorType,
      payload: asRecord(row.payload),
    }));
  }
}

/** Réduit une valeur JSON Prisma à un objet plat, ou `{}` (jamais de `any`). */
function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
