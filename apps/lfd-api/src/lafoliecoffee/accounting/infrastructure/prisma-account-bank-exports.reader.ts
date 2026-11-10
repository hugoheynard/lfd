import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { NAMING_COLUMNS, namingFromRow } from "./bank-export-naming.mapper.js";

import {
  AccountBankExportsReader,
  KnownAccountFingerprintsReader,
  type AccountBankExportFile,
  type AccountBankExportRecord,
  type KnownAccountFingerprints,
} from "../domain/ports/account-bank-exports.reader.js";
import { knownAccountFingerprintsOf } from "../domain/services/account-bank-export-selection.js";
import { NOT_REJECTED } from "./bank-line-correction.mapper.js";

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
        where: { export: { abandonedAt: null }, ...NOT_REJECTED },
        select: {
          accountFingerprint: true,
          export: { select: { importedAt: true, lastDownloadedAt: true } },
        },
      }),
      this.prisma.knownBankAccount.findMany({ select: { accountFingerprint: true } }),
    ]);
    return knownAccountFingerprintsOf(
      lines.map((line) => ({ accountFingerprint: line.accountFingerprint, ...line.export })),
      declared.map((row) => row.accountFingerprint),
    );
  }
}

/** Les exports d'une entité, et les lignes d'un export — l'entité dans chaque `where`. */
@Injectable()
export class PrismaAccountBankExportsReader extends AccountBankExportsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(legalEntityId: string): Promise<readonly AccountBankExportRecord[]> {
    const rows = await this.prisma.accountBankExport.findMany({
      where: { legalEntityId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        ...NAMING_COLUMNS,
        createdAt: true,
        accountCount: true,
        lastDownloadedAt: true,
        importedAt: true,
        abandonedAt: true,
      },
    });
    return rows.map(namingFromRow);
  }

  async fileOf(legalEntityId: string, exportId: string): Promise<AccountBankExportFile | null> {
    const row = await this.prisma.accountBankExport.findFirst({
      where: { id: exportId, legalEntityId },
      select: {
        abandonedAt: true,
        createdAt: true,
        accountCount: true,
        ...NAMING_COLUMNS,
        lines: {
          orderBy: { accountFingerprint: "asc" },
          select: { bankAccountId: true, companyId: true, accountFingerprint: true },
        },
      },
    });
    return row === null ? null : namingFromRow(row);
  }
}
