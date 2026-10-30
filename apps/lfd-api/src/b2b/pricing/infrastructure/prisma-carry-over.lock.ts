import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { currentTransaction } from "../../../platform/database/transaction.store.js";
import type { CarriedFamily } from "../domain/entities/decision-carry-over.js";
import { CarryOverLock } from "../domain/ports/carry-over.lock.js";
import { CarryOverLockOutsideTransactionError } from "./mercuriale-lock-errors.js";

/** L'espace de clés des verrous de report, pour ne croiser aucun autre verrou consultatif. */
const LOCK_NAMESPACE = "pricing.carry-over:";

/**
 * `pg_advisory_xact_lock` sur (famille, nouvelle référence), relâché au
 * `COMMIT` ou au `ROLLBACK` — plutôt qu'un `SELECT … FOR UPDATE` : la
 * décision reportée n'existe pas encore, et ce sont deux premiers reports
 * simultanés qu'il faut mettre en file.
 */
@Injectable()
export class PrismaCarryOverLock extends CarryOverLock {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async acquire(family: CarriedFamily, toSku: string): Promise<void> {
    if (currentTransaction() === undefined) {
      throw new CarryOverLockOutsideTransactionError();
    }
    const key = `${LOCK_NAMESPACE}${family}:${toSku}`;
    await this.prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }
}
