import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { currentTransaction } from "../../../platform/database/transaction.store.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { ShelfStockLock } from "../domain/shelf-stock-lock.js";

/** Espace de noms du verrou (plan du jour J, §11.2). */
const LOCK_NAMESPACE = "shelf:";

/** Demandé hors transaction : relâché aussitôt, il ne protégerait rien. */
export class ShelfStockLockOutsideTransactionError extends TechnicalError {
  constructor() {
    super(
      "resupply.shelf_stock.lock_outside_transaction",
      "Le verrou du stock de la vitrine exige une transaction ouverte : appeler ce port sous UnitOfWork.run.",
    );
  }
}

/**
 * `pg_advisory_xact_lock` sur `shelf:<jour>:<point>`, relâché au `COMMIT` ou
 * au `ROLLBACK` — la forme de `PrismaCollectionLock` (comptabilité). Rejoint
 * la transaction de l'appelant par le client transactionnel.
 */
@Injectable()
export class PrismaShelfStockLock extends ShelfStockLock {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lock(serviceDay: string, siteId: string): Promise<void> {
    if (currentTransaction() === undefined) {
      throw new ShelfStockLockOutsideTransactionError();
    }
    const key = `${LOCK_NAMESPACE}${serviceDay}:${siteId}`;
    await this.prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }
}
