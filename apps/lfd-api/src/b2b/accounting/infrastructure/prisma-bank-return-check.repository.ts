import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { BankReturnCheckDay } from "../domain/entities/bank-return-check.js";
import { BankReturnCheckRepository } from "../domain/ports/bank-return-check.repository.js";
import { returnDayColumn, returnDayOf } from "./collection-return.mapper.js";

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
