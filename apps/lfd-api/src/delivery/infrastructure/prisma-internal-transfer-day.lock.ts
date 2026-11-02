import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { currentTransaction } from "../../platform/database/transaction.store.js";
import { InternalTransferLockOutsideTransactionError } from "../domain/errors/internal-transfer-errors.js";
import { InternalTransferDayLock } from "../domain/ports/internal-transfer-day.lock.js";

/** L'espace de noms du verrou : aucune autre clé consultative ne le porte. */
const TRANSFER_DAY_LOCK_NAMESPACE = "delivery_internal_transfer_day:";

/**
 * `pg_advisory_xact_lock` par journée : il couvre aussi une journée SANS
 * transfert, que `FOR UPDATE` ne verrouillerait pas — c'est justement le cas
 * de la course (deux ouvertures). Relâché au `COMMIT` de l'unité de travail.
 */
@Injectable()
export class PrismaInternalTransferDayLock extends InternalTransferDayLock {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async hold(serviceDays: readonly string[]): Promise<void> {
    const days = [...new Set(serviceDays)].sort();
    if (days.length === 0) {
      return;
    }
    if (currentTransaction() === undefined) {
      throw new InternalTransferLockOutsideTransactionError(days.join(", "));
    }
    for (const day of days) {
      const key = `${TRANSFER_DAY_LOCK_NAMESPACE}${day}`;
      await this.prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    }
  }
}
