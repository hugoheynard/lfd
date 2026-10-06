import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { currentTransaction } from "../../platform/database/transaction.store.js";
import { TechnicalError } from "../../platform/shared/errors/app-error.js";
import { ProductionDayLock } from "../domain/ports/production-day.lock.js";
import type { ServiceDay } from "../domain/value-objects/service-day.value-object.js";

/** L'espace de noms du fournil : aucune autre clé consultative ne le porte. */
const DAY_LOCK_NAMESPACE = "production_day:";

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
 * Deux verrous, dans cet ordre, tenus jusqu'au `COMMIT` de l'unité de travail.
 *
 * 1. `pg_advisory_xact_lock` sur `production_day:<jour>` — il verrouille aussi
 *    une journée SANS ligne (jamais arrêtée). Le `FOR UPDATE` seul ne le
 *    faisait pas : deux clôtures concurrentes d'une journée ouverte fermaient
 *    toutes les deux (lot A0 du plan d'arrêt, B1, 2026-10-06). Aucune ligne
 *    « ouverte » n'est écrite pour autant.
 * 2. `SELECT … FOR UPDATE` sur la ligne `production_day` (D4 des fournées),
 *    gardé tel quel : `save` prend le même sur `tx`, et l'ordre consultatif
 *    puis ligne est le même pour tous les preneurs.
 *
 * La requête passe par le client ROUTÉ (`transactionalPrisma`) : dans une
 * unité de travail, elle vise la transaction en cours. Un seul transport
 * depuis le 2026-09-22 (adaptateur `pg`, Accelerate quitté) : ce que les e2e
 * éprouvent est ce que la production exécute.
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
    const key = `${DAY_LOCK_NAMESPACE}${day.value}`;
    await this.prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    await this.prisma.$queryRaw`
      SELECT "service_day" FROM "production"."production_day"
       WHERE "service_day" = ${day.value}
         FOR UPDATE`;
  }
}
