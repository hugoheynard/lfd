import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { LoyaltyAccount } from "../domain/entities/loyalty-account.js";
import { WelcomeBonusAlreadyCreditedError } from "../domain/errors/welcome-bonus-errors.js";
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
    try {
      await this.write(account);
    } catch (error) {
      const userId = account.holder.userId;
      if (userId !== null && isWelcomeRace(error, account)) {
        throw new WelcomeBonusAlreadyCreditedError(userId);
      }
      throw error;
    }
  }

  private async write(account: LoyaltyAccount): Promise<void> {
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

/**
 * Le seul refus d'unicité que le domaine sait nommer : la seconde ligne
 * `welcome` d'une personne, écrite par un passage concurrent malgré le verrou
 * (index `loyalty_ledger_entries_welcome_user_key`). Un livre qui écrit une
 * ligne `welcome` n'écrit qu'elle ; tout autre refus remonte tel quel.
 * `P2002` est duck-typé, sans importer le client.
 */
function isWelcomeRace(error: unknown, account: LoyaltyAccount): boolean {
  return (
    account.pendingEntries.some((entry) => entry.kind === "welcome") &&
    typeof error === "object" &&
    error !== null &&
    Reflect.get(error, "code") === "P2002"
  );
}
