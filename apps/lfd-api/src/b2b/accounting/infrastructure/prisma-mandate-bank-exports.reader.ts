import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  ImportedMandateAccountsReader,
  MandateBankExportsReader,
  type ExportedMandateLine,
  type MandateBankExportRecord,
} from "../domain/ports/mandate-bank-exports.reader.js";

const LINE_COLUMNS = { mandateId: true, rum: true, accountFingerprint: true } as const;

/** Les lignes des exports MARQUÉS importés d'une entité — ce que la banque a. */
@Injectable()
export class PrismaImportedMandateAccountsReader extends ImportedMandateAccountsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  of(legalEntityId: string): Promise<readonly ExportedMandateLine[]> {
    return this.prisma.mandateBankExportLine.findMany({
      where: { export: { legalEntityId, importedAt: { not: null } } },
      select: LINE_COLUMNS,
    });
  }
}

/** Les exports d'une entité, et les lignes d'un export — l'entité dans chaque `where`. */
@Injectable()
export class PrismaMandateBankExportsReader extends MandateBankExportsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  list(legalEntityId: string): Promise<readonly MandateBankExportRecord[]> {
    return this.prisma.mandateBankExport.findMany({
      where: { legalEntityId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, createdAt: true, mandateCount: true, importedAt: true },
    });
  }

  async linesOf(
    legalEntityId: string,
    exportId: string,
  ): Promise<readonly ExportedMandateLine[] | null> {
    const row = await this.prisma.mandateBankExport.findFirst({
      where: { id: exportId, legalEntityId },
      select: { lines: { orderBy: { rum: "asc" }, select: LINE_COLUMNS } },
    });
    return row?.lines ?? null;
  }
}
