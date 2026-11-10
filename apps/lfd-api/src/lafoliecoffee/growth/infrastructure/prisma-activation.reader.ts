import { Injectable } from "@nestjs/common";

import type { ActivationView } from "@lfd/contracts";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Clock } from "../../../platform/time/clock.js";
import { ACTIVITY_TYPES } from "../domain/activity-event.js";
import { companyIdsOf, deriveActivations, type ActivationEvent } from "../domain/activation.js";
import { CompanyNamer } from "../domain/ports/company-namer.js";
import { ActivationReader } from "../domain/ports/activation.reader.js";

/**
 * Adaptateur Prisma du tunnel d'activation : lit le journal (sujet = société) —
 * les faits `company.declared` / `company.step_reached` / `company.activated` —
 * puis délègue à la fonction pure `deriveActivations`.
 *
 * Il ne lit **aucune table voisine** : l'enseigne des dossiers lui vient du port
 * `CompanyNamer`, qui appartient au même contexte. Une lecture directe de
 * `companies` serait une jointure de plus qu'aucune porte ne verrait.
 */
@Injectable()
export class PrismaActivationReader extends ActivationReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly companies: CompanyNamer,
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

    // Une seule lecture pour toutes les enseignes : le tunnel en nomme autant
    // qu'il porte de dossiers, et les demander une par une ferait une requête
    // par ligne d'écran.
    const names = await this.companies.namesOf(companyIdsOf(events));
    return deriveActivations(events, this.clock.now(), names);
  }
}

/** Réduit une valeur JSON Prisma à un objet plat, ou `{}` (jamais de `any`). */
function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
