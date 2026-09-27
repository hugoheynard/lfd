import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { currentTransaction } from "../../../platform/database/transaction.store.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { LoyaltyHolderLock } from "../domain/ports/loyalty-holder.lock.js";
import type { LoyaltyHolder } from "../domain/value-objects/loyalty-holder.js";

/**
 * Espace de noms du verrou : deux verrous consultatifs d'usages différents ne
 * se croisent pas (même convention que `prisma-person-attachment.lock.ts`).
 */
const LOCK_NAMESPACE = "loyalty.ledger:";

/**
 * Le verrou a été demandé hors d'une unité de travail — une faute de câblage :
 * un `pg_advisory_xact_lock` émis en autocommit est relâché à la fin de sa
 * propre instruction, et ce qui le suit ne serait plus protégé.
 */
export class LoyaltyLockOutsideTransactionError extends TechnicalError {
  constructor() {
    super(
      "loyalty.ledger.lock_outside_transaction",
      "Le verrou du livre de fidélité exige une transaction ouverte : appeler ce port sous UnitOfWork.run.",
    );
  }
}

/**
 * `pg_advisory_xact_lock` sur la clé préfixée du titulaire (`company:` /
 * `user:`) : un identifiant de société et un identifiant de personne ne
 * tombent jamais sur le même verrou. Relâché au `COMMIT` ou au `ROLLBACK`.
 */
@Injectable()
export class PrismaLoyaltyHolderLock extends LoyaltyHolderLock {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async acquire(holder: LoyaltyHolder): Promise<void> {
    if (currentTransaction() === undefined) {
      throw new LoyaltyLockOutsideTransactionError();
    }
    const key = `${LOCK_NAMESPACE}${holder.lockKey}`;
    await this.prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }
}
