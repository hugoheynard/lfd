import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { TechnicalError } from "../../platform/shared/errors/app-error.js";
import {
  AutoCloseAttemptLog,
  type DatedAttemptTrace,
} from "../domain/ports/auto-close-attempt-log.js";
import { AutoCloseAttempts, type AutoCloseOutcome } from "../domain/ports/auto-close-attempts.js";
import { AutoCloseRoundReader } from "../domain/ports/auto-close-round.reader.js";
import type { AttemptTrace } from "../domain/services/auto-close-round.js";
import type { ServiceDay } from "../domain/value-objects/service-day.value-object.js";
import type { ServiceRange } from "../domain/value-objects/service-range.value-object.js";

/** Une issue que le domaine ne connaît pas : un défaut de schéma, pas un refus. */
class UnknownAutoCloseOutcomeError extends TechnicalError {
  constructor(value: string) {
    super(
      "production.auto_close_attempt.unknown_outcome",
      `Une tentative d'arrêt automatique porte en base une issue inconnue (« ${value} ») : l'état des journées ne peut pas la lire. Rien n'a été écrit ; signalez-le à l'équipe technique.`,
    );
  }
}

const OUTCOMES: readonly AutoCloseOutcome[] = ["pending", "closed", "empty", "failed"];

/** La colonne `outcome` relue : la contrainte CHECK la tient, le domaine la revérifie. */
function outcomeOf(value: string): AutoCloseOutcome {
  const outcome = OUTCOMES.find((known) => known === value);
  if (outcome === undefined) {
    throw new UnknownAutoCloseOutcomeError(value);
  }
  return outcome;
}

/** Ce que le tour lit : la journée du fournil, et la trace de sa tentative. */
@Injectable()
export class PrismaAutoCloseRoundReader extends AutoCloseRoundReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isPlanClosed(day: ServiceDay): Promise<boolean> {
    const row = await this.prisma.productionDay.findUnique({
      where: { serviceDay: day.value },
      select: { closedAt: true },
    });
    return row?.closedAt != null;
  }

  async attemptOf(day: ServiceDay): Promise<AttemptTrace | null> {
    const row = await this.prisma.productionAutoCloseAttempt.findUnique({
      where: { serviceDay: day.value },
      select: { outcome: true, attemptedAt: true },
    });
    return row === null ? null : { outcome: outcomeOf(row.outcome), attemptedAt: row.attemptedAt };
  }
}

/** Les tentatives d'une plage, pour l'état des journées du prévisionnel (A3). */
@Injectable()
export class PrismaAutoCloseAttemptLog extends AutoCloseAttemptLog {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async between(range: ServiceRange): Promise<readonly DatedAttemptTrace[]> {
    const rows = await this.prisma.productionAutoCloseAttempt.findMany({
      where: { serviceDay: { gte: range.from.value, lte: range.to.value } },
      select: { serviceDay: true, outcome: true, attemptedAt: true },
    });
    return rows.map((row) => ({
      day: row.serviceDay,
      outcome: outcomeOf(row.outcome),
      attemptedAt: row.attemptedAt,
    }));
  }
}

/**
 * La trace des tentatives, dans `production.production_auto_close_attempt`.
 *
 * `createMany … skipDuplicates` = `INSERT … ON CONFLICT DO NOTHING` : la
 * seconde instance n'écrit rien, sans erreur Postgres, et le compte rendu dit
 * laquelle a pris la tentative.
 */
@Injectable()
export class PrismaAutoCloseAttempts extends AutoCloseAttempts {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async claim(day: ServiceDay, at: Date): Promise<boolean> {
    const pending: AutoCloseOutcome = "pending";
    const { count } = await this.prisma.productionAutoCloseAttempt.createMany({
      data: [{ serviceDay: day.value, attemptedAt: at, outcome: pending }],
      skipDuplicates: true,
    });
    return count > 0;
  }

  async settle(
    day: ServiceDay,
    outcome: Exclude<AutoCloseOutcome, "pending">,
    failure: string | null,
    at: Date,
  ): Promise<void> {
    await this.prisma.productionAutoCloseAttempt.update({
      where: { serviceDay: day.value },
      data: { outcome, failure, settledAt: at },
    });
  }
}
