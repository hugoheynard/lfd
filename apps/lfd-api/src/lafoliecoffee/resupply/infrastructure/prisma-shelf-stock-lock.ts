import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { currentTransaction } from "../../../platform/database/transaction.store.js";
import { ShelfStockLock } from "../domain/shelf-stock-lock.js";
import { ShelfStockLockOutsideTransactionError } from "../domain/shelf-stock-lock-errors.js";

/** Espace de noms du verrou (L2, `documentation/limites-de-commande/jour-meme-sur-stock.md`). */
const LOCK_NAMESPACE = "shelf:";

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
