import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { currentTransaction } from "../../../platform/database/transaction.store.js";
import { BankReturnCheckDay } from "../domain/entities/bank-return-check.js";
import { BankReturnCheckRepository } from "../domain/ports/bank-return-check.repository.js";
import { AttestationLockOutsideTransactionError } from "./attestation-lock-outside-transaction.error.js";
import { returnDayColumn, returnDayOf } from "./collection-return.mapper.js";

/** L'espace de noms du verrou : aucune autre clé consultative ne le porte. */
const CHECK_DAY_LOCK_NAMESPACE = "accounting_bank_return_check:";

/**
 * Adaptateur d'écriture de « Retours contrôlés ». Registre d'ajouts : `save`
 * n'insère que les lignes nouvelles de l'agrégat — la base refuse de toute
 * façon UPDATE et DELETE (`bank_return_check_append_only`).
 */
@Injectable()
export class PrismaBankReturnCheckRepository extends BankReturnCheckRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(legalEntityId: string, day: string): Promise<BankReturnCheckDay> {
    const rows = await this.prisma.bankReturnCheck.findMany({
      where: { legalEntityId, day: returnDayColumn(day) },
      orderBy: [{ checkedAt: "asc" }, { id: "asc" }],
    });
    return BankReturnCheckDay.rehydrate({
      legalEntityId,
      day,
      entries: rows.map((row) => ({
        id: row.id,
        day: returnDayOf(row.day),
        at: row.checkedAt,
        staffId: row.checkedByStaffId,
        withdrawn: row.withdrawn,
        note: row.note,
      })),
    });
  }

  /**
   * `pg_advisory_xact_lock` par (entité, jour) : il couvre aussi un jour sans
   * ligne, que `FOR UPDATE` ne verrouillerait pas — la course de deux
   * premières attestations. La lecture qui suit, en READ COMMITTED, voit ce
   * que le geste concurrent a validé pendant l'attente.
   */
  async loadLocked(legalEntityId: string, day: string): Promise<BankReturnCheckDay> {
    if (currentTransaction() === undefined) {
      throw new AttestationLockOutsideTransactionError();
    }
    const key = `${CHECK_DAY_LOCK_NAMESPACE}${legalEntityId}:${day}`;
    await this.prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    return this.load(legalEntityId, day);
  }

  async save(checkDay: BankReturnCheckDay): Promise<void> {
    const entries = checkDay.newEntries();
    if (entries.length === 0) {
      return;
    }
    await this.prisma.bankReturnCheck.createMany({
      data: entries.map((entry) => ({
        id: entry.id,
        legalEntityId: checkDay.legalEntityId,
        day: returnDayColumn(entry.day),
        checkedAt: entry.at,
        checkedByStaffId: entry.staffId,
        withdrawn: entry.withdrawn,
        note: entry.note,
      })),
    });
  }
}
