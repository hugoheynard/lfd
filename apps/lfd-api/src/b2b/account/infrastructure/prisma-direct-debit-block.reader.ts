import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  DirectDebitBlockReader,
  type CreditedCompanyEntry,
} from "../domain/ports/direct-debit-block.reader.js";

/** Adaptateur Prisma de la lecture des blocages du prélèvement. */
@Injectable()
export class PrismaDirectDebitBlockReader extends DirectDebitBlockReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listCredited(): Promise<readonly CreditedCompanyEntry[]> {
    const rows = await this.prisma.company.findMany({
      // « À crédit » = au moins un terme accordé : une société sans crédit n'a
      // pas de prélèvement à bloquer, elle n'a rien à faire sur cette page.
      where: { NOT: { grantedTerms: { isEmpty: true } } },
      select: {
        id: true,
        reference: true,
        raisonSociale: true,
        enseigne: true,
        directDebitBlockedAt: true,
        directDebitBlockedBy: true,
        directDebitBlockReason: true,
      },
      orderBy: [{ enseigne: "asc" }, { raisonSociale: "asc" }],
    });
    return rows.map((row) => ({
      companyId: row.id,
      reference: row.reference,
      raisonSociale: row.raisonSociale,
      enseigne: row.enseigne,
      // Les trois colonnes vont ensemble (CHECK en base) ; on exige quand même
      // les trois plutôt que l'instant seul.
      block:
        row.directDebitBlockedAt === null ||
        row.directDebitBlockedBy === null ||
        row.directDebitBlockReason === null
          ? null
          : {
              blockedAt: row.directDebitBlockedAt,
              blockedByStaffId: row.directDebitBlockedBy,
              reason: row.directDebitBlockReason,
            },
    }));
  }
}
