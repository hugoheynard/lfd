import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { currentTransaction } from "../../../platform/database/transaction.store.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { CollectionBatchLock } from "../domain/ports/collection-batch-lock.js";

/** Demandé hors transaction : relâché aussitôt, il ne protégerait rien. */
export class CollectionBatchLockOutsideTransactionError extends TechnicalError {
  constructor() {
    super(
      "accounting.collection.batch_lock_outside_transaction",
      "Le verrou d'un lot de prélèvement exige une transaction ouverte : appeler ce port sous UnitOfWork.run.",
    );
  }
}

/** `SELECT … FOR UPDATE` sur la ligne du lot ; un lot absent ne verrouille rien. */
@Injectable()
export class PrismaCollectionBatchLock extends CollectionBatchLock {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lock(batchId: string): Promise<void> {
    if (currentTransaction() === undefined) {
      throw new CollectionBatchLockOutsideTransactionError();
    }
    await this.prisma.$queryRaw`
      SELECT "id" FROM "public"."collection_batch" WHERE "id" = ${batchId} FOR UPDATE`;
  }
}
