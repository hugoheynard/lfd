import { Injectable } from "@nestjs/common";

import { currentTransaction } from "../../../platform/database/transaction.store.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { AccountHierarchyLock } from "../domain/ports/account-hierarchy.lock.js";

/**
 * La clé du verrou : UNE pour tout le portefeuille (plan-sous-comptes §5).
 * Son espace de noms la tient à l'écart des autres verrous consultatifs.
 */
const LOCK_KEY = "account.company-hierarchy";

/**
 * Le verrou a été demandé hors d'une unité de travail — faute de câblage : en
 * autocommit, `pg_advisory_xact_lock` serait relâché à la fin de sa propre
 * instruction, et les deux gestes concurrents ne seraient plus sérialisés.
 */
export class AccountHierarchyLockOutsideTransactionError extends TechnicalError {
  constructor() {
    super(
      "account.hierarchy.lock_outside_transaction",
      "Le verrou de la hiérarchie des comptes exige une transaction ouverte : appeler ce port sous UnitOfWork.run.",
    );
  }
}

/**
 * Adaptateur Postgres du verrou de la hiérarchie — calqué sur
 * `PrismaDeliveryProcedureLock`. Relâché au `COMMIT` ou au `ROLLBACK`.
 */
@Injectable()
export class PrismaAccountHierarchyLock extends AccountHierarchyLock {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async acquire(): Promise<void> {
    if (currentTransaction() === undefined) {
      throw new AccountHierarchyLockOutsideTransactionError();
    }
    await this.prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${LOCK_KEY}, 0))`;
  }
}
