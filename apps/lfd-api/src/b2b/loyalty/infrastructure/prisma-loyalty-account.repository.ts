import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { currentTransaction } from "../../../platform/database/transaction.store.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { LoyaltyAccount } from "../domain/entities/loyalty-account.js";
import { LoyaltyAccountRepository } from "../domain/ports/loyalty-account.repository.js";
import type { LoyaltyHolder } from "../domain/value-objects/loyalty-holder.js";

/**
 * Espace de noms du verrou : deux verrous consultatifs d'usages différents ne
 * se croisent pas (même convention que `prisma-person-attachment.lock.ts`).
 */
const LOCK_NAMESPACE = "loyalty.ledger:";

/**
 * Le livre a été chargé hors d'une unité de travail — une faute de câblage :
 * un `pg_advisory_xact_lock` émis en autocommit est relâché à la fin de sa
 * propre instruction, et la somme qui le suit ne serait plus protégée.
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
 * Le grand livre en Postgres. `loadLocked` prend `pg_advisory_xact_lock` sur la
 * clé préfixée du titulaire (`company:` / `user:`), PUIS relit la somme : en
 * READ COMMITTED, chaque instruction voit ce que la transaction concurrente a
 * commité pendant qu'on attendait. Le verrou est relâché au `COMMIT` ou au
 * `ROLLBACK`, jamais oublié.
 *
 * Le client injecté est le proxy transactionnel : tout vise la transaction
 * ambiante.
 */
@Injectable()
export class PrismaLoyaltyAccountRepository extends LoyaltyAccountRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async loadLocked(holder: LoyaltyHolder): Promise<LoyaltyAccount> {
    if (currentTransaction() === undefined) {
      throw new LoyaltyLockOutsideTransactionError();
    }
    const key = `${LOCK_NAMESPACE}${holder.lockKey}`;
    await this.prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    const sum = await this.prisma.loyaltyLedgerEntry.aggregate({
      where: { companyId: holder.companyId, userId: holder.userId },
      _sum: { points: true },
    });
    return LoyaltyAccount.reconstitute(holder, sum._sum.points ?? 0);
  }

  async save(account: LoyaltyAccount): Promise<void> {
    if (account.pendingEntries.length === 0) {
      return;
    }
    await this.prisma.loyaltyLedgerEntry.createMany({
      data: account.pendingEntries.map((entry) => ({
        id: entry.id,
        companyId: entry.holder.companyId,
        userId: entry.holder.userId,
        kind: entry.kind,
        points: entry.points,
        orderId: entry.orderId,
        voucherId: entry.voucherId,
        occurredAt: entry.occurredAt,
        actorUserId: entry.actorUserId,
        staffUserId: entry.staffUserId,
        reason: entry.reason,
      })),
    });
  }
}
