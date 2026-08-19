import { Injectable } from "@nestjs/common";

import type { ActivationView } from "@lfd/contracts";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Clock } from "../../../platform/time/clock.js";
import { ACTIVITY_TYPES } from "../domain/activity-event.js";
import { deriveActivations, type ActivationEvent } from "../domain/activation.js";
import { ActivationReader } from "../domain/ports/activation.reader.js";

/**
 * Adaptateur Prisma du tunnel d'activation : lit le journal (sujet = société) —
 * les faits `company.declared` / `company.step_reached` / `company.activated` —
 * puis délègue à la fonction pure `deriveActivations`.
 */
@Injectable()
export class PrismaActivationReader extends ActivationReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {
    super();
  }

  async list(): Promise<ActivationView[]> {
    const rows = await this.prisma.activityEvent.findMany({
      where: {
        subjectType: "company",
        type: {
          in: [
            ACTIVITY_TYPES.companyDeclared,
            ACTIVITY_TYPES.companyStepReached,
            ACTIVITY_TYPES.companyActivated,
          ],
        },
      },
      select: { type: true, subjectId: true, occurredAt: true, actorType: true, payload: true },
    });

    const events: ActivationEvent[] = rows.map((row) => ({
      type: row.type,
      subjectId: row.subjectId,
      occurredAt: row.occurredAt,
      actorType: row.actorType,
      payload: asRecord(row.payload),
    }));

    return deriveActivations(events, this.clock.now());
  }
}

/** Réduit une valeur JSON Prisma à un objet plat, ou `{}` (jamais de `any`). */
function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
