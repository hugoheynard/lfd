import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Clock } from "../../../platform/time/clock.js";
import { ACTIVITY_TYPES } from "../domain/activity-event.js";
import type { ProspectView } from "@lfd/contracts";

import { deriveProspects, type ProspectEvent } from "../domain/prospect.js";
import { CustomerEmailReader } from "../domain/ports/customer-email.reader.js";
import { ProspectReader } from "../domain/ports/prospect.reader.js";

/**
 * Adaptateur Prisma des prospects : lit le journal (`growth.activity_events`),
 * demande l'adresse de chaque personne à sa fiche (`CustomerEmailReader` — le
 * journal ne la porte plus depuis le lot B du plan des phrases, 2026-09-19),
 * puis délègue la dérivation à la fonction pure `deriveProspects`. L'instant
 * vient du `Clock` (récence déterministe en test).
 */
@Injectable()
export class PrismaProspectReader extends ProspectReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly emails: CustomerEmailReader,
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

    const emails = await this.emails.emailsOf(events.map((event) => event.subjectId));
    return deriveProspects(events, this.clock.now(), emails);
  }
}

/** Réduit une valeur JSON Prisma à un objet plat, ou `{}` (jamais de `any`). */
function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
