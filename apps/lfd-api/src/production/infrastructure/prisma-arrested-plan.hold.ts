import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { currentTransaction } from "../../platform/database/transaction.store.js";
import { TechnicalError } from "../../platform/shared/errors/app-error.js";
import { ArrestedPlanHold } from "../channels/packing/arrested-plan.hold.js";
import { dayLockKey } from "./prisma-production-day.lock.js";

/** Le plan tenu hors d'une unité de travail : un défaut de code, pas un refus. */
class PlanHoldOutsideTransactionError extends TechnicalError {
  constructor(serviceDay: string) {
    super(
      "production.plan_hold.outside_transaction",
      `Le plan du ${serviceDay} a été tenu hors d'une unité de travail : le verrou serait ` +
        "relâché aussitôt pris. Le geste n'a rien écrit ; signalez-le à l'équipe technique.",
    );
  }
}

/**
 * Le verrou consultatif PARTAGÉ sur la même clé que `PrismaProductionDayLock`
 * (exclusif) : partagé contre partagé passe, partagé contre exclusif attend.
 * Puis `closed_at` seul, lu après le verrou — donc après toute réouverture
 * validée avant lui.
 */
@Injectable()
export class PrismaArrestedPlanHold extends ArrestedPlanHold {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async hold(serviceDay: string): Promise<boolean> {
    if (currentTransaction() === undefined) {
      throw new PlanHoldOutsideTransactionError(serviceDay);
    }
    const key = dayLockKey(serviceDay);
    await this.prisma.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${key}, 0))`;
    const row = await this.prisma.productionDay.findUnique({
      where: { serviceDay },
      select: { closedAt: true },
    });
    return row !== null && row.closedAt !== null;
  }
}
