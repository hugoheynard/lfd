import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { currentTransaction } from "../../platform/database/transaction.store.js";
import { TechnicalError } from "../../platform/shared/errors/app-error.js";
import { ProductionDayLock } from "../domain/ports/production-day.lock.js";
import type { ServiceDay } from "../domain/value-objects/service-day.value-object.js";

/** Le verrou demandé hors d'une unité de travail : un défaut de code, pas un refus. */
class DayLockOutsideTransactionError extends TechnicalError {
  constructor(serviceDay: string) {
    super(
      "production.day_lock.outside_transaction",
      `Le verrou de la journée du ${serviceDay} a été demandé hors d'une unité de travail : il serait relâché aussitôt pris. Le geste n'a rien écrit ; signalez-le à l'équipe technique.`,
    );
  }
}

/**
 * `SELECT … FOR UPDATE` sur la ligne `production_day` (D4 des fournées).
 *
 * La requête passe par le client ROUTÉ (`transactionalPrisma`) : dans une
 * unité de travail, elle vise la transaction en cours, et le verrou tient
 * jusqu'à son `COMMIT`. Une journée sans ligne (jamais arrêtée) ne verrouille
 * rien — et n'a ni bac ni fournée à protéger.
 *
 * ⚠️ **Non vérifié à travers Prisma Accelerate** (plan, D4) : les e2e passent
 * par l'adaptateur `pg`. Une transaction interactive y est documentée, mais le
 * maintien du verrou jusqu'au `COMMIT` n'a été éprouvé que sur `pg`.
 */
@Injectable()
export class PrismaProductionDayLock extends ProductionDayLock {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lock(day: ServiceDay): Promise<void> {
    if (currentTransaction() === undefined) {
      throw new DayLockOutsideTransactionError(day.value);
    }
    await this.prisma.$queryRaw`
      SELECT "service_day" FROM "production"."production_day"
       WHERE "service_day" = ${day.value}
         FOR UPDATE`;
  }
}
