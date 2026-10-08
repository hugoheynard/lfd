import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import {
  CollectionAutopilotRuns,
  type CollectionAutopilotOutcome,
  type SettledAutopilotOutcome,
} from "../domain/ports/collection-autopilot-runs.js";
import {
  LastAutopilotRunReader,
  type AutopilotRunRecord,
} from "../domain/ports/last-autopilot-run.reader.js";

const OUTCOMES: readonly CollectionAutopilotOutcome[] = [
  "pending",
  "constituted",
  "nothing_to_collect",
  "not_yet_open",
  "failed",
];

/** Une issue que le domaine ne connaît pas : un défaut de schéma, pas un refus. */
class UnknownAutopilotOutcomeError extends TechnicalError {
  constructor(value: string) {
    super(
      "accounting.collection_autopilot.unknown_outcome",
      `Une tentative de la préparation automatique porte en base une issue inconnue (« ${value} ») : la contrainte collection_autopilot_run_outcome a été levée. Rien n'a été écrit ; prévenir la technique.`,
    );
  }
}

/** La colonne `outcome` relue : le CHECK la tient, le domaine la revérifie. */
function outcomeOf(value: string): CollectionAutopilotOutcome {
  const outcome = OUTCOMES.find((known) => known === value);
  if (outcome === undefined) {
    throw new UnknownAutopilotOutcomeError(value);
  }
  return outcome;
}

/**
 * La trace des tentatives, dans `public.collection_autopilot_run`.
 *
 * `createMany … skipDuplicates` = `INSERT … ON CONFLICT DO NOTHING` : le
 * second passage n'écrit rien, sans erreur Postgres, et sait qu'il n'a pas
 * pris la tentative.
 */
@Injectable()
export class PrismaCollectionAutopilotRuns extends CollectionAutopilotRuns {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async attempted(legalEntityId: string, cycleClosesAt: Date): Promise<boolean> {
    const row = await this.prisma.collectionAutopilotRun.findUnique({
      where: { legalEntityId_cycleClosesAt: { legalEntityId, cycleClosesAt } },
      select: { legalEntityId: true },
    });
    return row !== null;
  }

  async claim(legalEntityId: string, cycleClosesAt: Date, at: Date): Promise<boolean> {
    const pending: CollectionAutopilotOutcome = "pending";
    const { count } = await this.prisma.collectionAutopilotRun.createMany({
      data: [{ legalEntityId, cycleClosesAt, ranAt: at, outcome: pending }],
      skipDuplicates: true,
    });
    return count > 0;
  }

  async settle(
    legalEntityId: string,
    cycleClosesAt: Date,
    outcome: SettledAutopilotOutcome,
    message: string | null,
  ): Promise<void> {
    await this.prisma.collectionAutopilotRun.update({
      where: { legalEntityId_cycleClosesAt: { legalEntityId, cycleClosesAt } },
      data: { outcome, message },
    });
  }
}

/** La dernière tentative d'une entité, pour sa fiche et l'écran du mois. */
@Injectable()
export class PrismaLastAutopilotRunReader extends LastAutopilotRunReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lastOf(legalEntityId: string): Promise<AutopilotRunRecord | null> {
    const row = await this.prisma.collectionAutopilotRun.findFirst({
      where: { legalEntityId },
      orderBy: { cycleClosesAt: "desc" },
      select: { cycleClosesAt: true, ranAt: true, outcome: true, message: true },
    });
    return row === null ? null : { ...row, outcome: outcomeOf(row.outcome) };
  }
}
