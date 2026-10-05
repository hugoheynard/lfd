import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { currentTransaction } from "../../../platform/database/transaction.store.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { CollectionLock } from "../domain/ports/collection-lock.js";

/** Espace de noms du verrou (même convention que `prisma-loyalty-holder.lock.ts`). */
const LOCK_NAMESPACE = "accounting.collection:";

/** Demandé hors transaction : relâché aussitôt, il ne protégerait rien. */
export class CollectionLockOutsideTransactionError extends TechnicalError {
  constructor() {
    super(
      "accounting.collection.lock_outside_transaction",
      "Le verrou de constitution des lots exige une transaction ouverte : appeler ce port sous UnitOfWork.run.",
    );
  }
}

/** `pg_advisory_xact_lock` sur l'entité, relâché au `COMMIT` ou au `ROLLBACK`. */
@Injectable()
export class PrismaCollectionLock extends CollectionLock {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async acquire(legalEntityId: string): Promise<void> {
    if (currentTransaction() === undefined) {
      throw new CollectionLockOutsideTransactionError();
    }
    const key = `${LOCK_NAMESPACE}${legalEntityId}`;
    await this.prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }
}
