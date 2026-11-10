import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { BankReturnChecksReader } from "../domain/ports/bank-return-checks.reader.js";
import type { BankReturnCheckLine } from "../domain/services/bank-return-checks.js";
import { returnDayOf } from "./collection-return.mapper.js";

/** Lecture de « Retours contrôlés » d'une entité : toutes ses lignes, d'un coup. */
@Injectable()
export class PrismaBankReturnChecksReader extends BankReturnChecksReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ofEntity(legalEntityId: string): Promise<readonly BankReturnCheckLine[]> {
    const rows = await this.prisma.bankReturnCheck.findMany({
      where: { legalEntityId },
      orderBy: [{ day: "asc" }, { checkedAt: "asc" }, { id: "asc" }],
      select: { id: true, day: true, checkedAt: true, checkedByStaffId: true, withdrawn: true },
    });
    return rows.map((row) => ({
      id: row.id,
      day: returnDayOf(row.day),
      at: row.checkedAt,
      staffId: row.checkedByStaffId,
      withdrawn: row.withdrawn,
    }));
  }
}
