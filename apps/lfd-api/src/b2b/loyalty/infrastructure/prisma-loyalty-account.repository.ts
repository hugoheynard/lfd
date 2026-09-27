import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { LoyaltyAccount } from "../domain/entities/loyalty-account.js";
import { LoyaltyAccountRepository } from "../domain/ports/loyalty-account.repository.js";
import { LoyaltyHolderLock } from "../domain/ports/loyalty-holder.lock.js";
import type { LoyaltyHolder } from "../domain/value-objects/loyalty-holder.js";

/**
 * Le grand livre en Postgres. `loadLocked` prend le verrou du titulaire
 * ({@link LoyaltyHolderLock}), PUIS relit la somme : en READ COMMITTED,
 * chaque instruction voit ce que la transaction concurrente a commité pendant
 * qu'on attendait. Le verrou refuse d'être pris hors transaction.
 *
 * Le client injecté est le proxy transactionnel : tout vise la transaction
 * ambiante.
 */
@Injectable()
export class PrismaLoyaltyAccountRepository extends LoyaltyAccountRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lock: LoyaltyHolderLock,
  ) {
    super();
  }

  async loadLocked(holder: LoyaltyHolder): Promise<LoyaltyAccount> {
    await this.lock.acquire(holder);
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
