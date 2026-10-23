import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  AccountBankExportsReader,
  KnownAccountFingerprintsReader,
  type AccountBankExportFile,
  type AccountBankExportRecord,
  type KnownAccountFingerprints,
} from "../domain/ports/account-bank-exports.reader.js";

/**
 * Ce que la banque a, ou va avoir — **sans filtre d'entité, exprès** : la
 * portée est l'abonnement CENET (R7, choix du 2026-10-23, doc § 7, Q-B9). Si
 * la banque répond « par ICS », c'est ici qu'on filtre par `legalEntityId`.
 */
@Injectable()
export class PrismaKnownAccountFingerprintsReader extends KnownAccountFingerprintsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async all(): Promise<KnownAccountFingerprints> {
    const [lines, declared] = await Promise.all([
      this.prisma.accountBankExportLine.findMany({
        where: { export: { abandonedAt: null } },
        select: { accountFingerprint: true, export: { select: { importedAt: true } } },
      }),
      this.prisma.knownBankAccount.findMany({ select: { accountFingerprint: true } }),
    ]);
    const known = new Set(declared.map((row) => row.accountFingerprint));
    const inFlight = new Set<string>();
    for (const line of lines) {
      (line.export.importedAt === null ? inFlight : known).add(line.accountFingerprint);
    }
    return { known, inFlight };
  }
}

/** Les exports d'une entité, et les lignes d'un export — l'entité dans chaque `where`. */
@Injectable()
export class PrismaAccountBankExportsReader extends AccountBankExportsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  list(legalEntityId: string): Promise<readonly AccountBankExportRecord[]> {
    return this.prisma.accountBankExport.findMany({
      where: { legalEntityId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        createdAt: true,
        accountCount: true,
        importedAt: true,
        abandonedAt: true,
      },
    });
  }

  async fileOf(legalEntityId: string, exportId: string): Promise<AccountBankExportFile | null> {
    const row = await this.prisma.accountBankExport.findFirst({
      where: { id: exportId, legalEntityId },
      select: {
        abandonedAt: true,
        lines: {
          orderBy: { accountFingerprint: "asc" },
          select: { bankAccountId: true, companyId: true, accountFingerprint: true },
        },
      },
    });
    return row === null ? null : { lines: row.lines, abandonedAt: row.abandonedAt };
  }
}
