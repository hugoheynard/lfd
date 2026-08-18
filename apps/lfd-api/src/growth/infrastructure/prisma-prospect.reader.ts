import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { Clock } from "../../infra/time/clock.js";
import { ACTIVITY_TYPES } from "../domain/activity-event.js";
import type { ProspectView } from "@lfd/contracts";

import { deriveProspects, type ProspectEvent } from "../domain/prospect.js";
import { ProspectReader } from "../domain/ports/prospect.reader.js";

/**
 * Adaptateur Prisma des prospects : lit le journal (`growth.activity_events`) —
 * et **rien d'autre** — puis délègue la dérivation à la fonction pure
 * `deriveProspects`. L'instant vient du `Clock` (récence déterministe en test).
 */
@Injectable()
export class PrismaProspectReader extends ProspectReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {
    super();
  }

  async list(): Promise<ProspectView[]> {
    const rows = await this.prisma.activityEvent.findMany({
      where: {
        subjectType: "user",
        type: { in: [ACTIVITY_TYPES.userRegistered, ACTIVITY_TYPES.orderPlaced] },
      },
      select: { type: true, subjectId: true, occurredAt: true, payload: true },
    });

    const events: ProspectEvent[] = rows.map((row) => ({
      type: row.type,
      subjectId: row.subjectId,
      occurredAt: row.occurredAt,
      payload: asRecord(row.payload),
    }));

    return deriveProspects(events, this.clock.now());
  }
}

/** Réduit une valeur JSON Prisma à un objet plat, ou `{}` (jamais de `any`). */
function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
