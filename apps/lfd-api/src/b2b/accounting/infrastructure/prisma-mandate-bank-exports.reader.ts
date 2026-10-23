import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { NOT_REJECTED } from "./bank-line-correction.mapper.js";
import {
  ImportedMandateAccountsReader,
  MandateBankExportsReader,
  MandateBankLinesReader,
  type MandateBankLineStanding,
  type ExportedMandateLine,
  type MandateBankExportFile,
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
      where: { export: { legalEntityId, importedAt: { not: null } }, ...NOT_REJECTED },
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
      select: {
        id: true,
        createdAt: true,
        mandateCount: true,
        lastDownloadedAt: true,
        importedAt: true,
        abandonedAt: true,
      },
    });
  }

  async fileOf(legalEntityId: string, exportId: string): Promise<MandateBankExportFile | null> {
    const row = await this.prisma.mandateBankExport.findFirst({
      where: { id: exportId, legalEntityId },
      select: { abandonedAt: true, lines: { orderBy: { rum: "asc" }, select: LINE_COLUMNS } },
    });
    return row === null ? null : { lines: row.lines, abandonedAt: row.abandonedAt };
  }
}

/** Les lignes des exports non abandonnés d'une entité — l'entité dans le `where`. */
@Injectable()
export class PrismaMandateBankLinesReader extends MandateBankLinesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async linesOf(legalEntityId: string): Promise<readonly MandateBankLineStanding[]> {
    const rows = await this.prisma.mandateBankExportLine.findMany({
      where: { export: { legalEntityId, abandonedAt: null } },
      select: {
        mandateId: true,
        accountFingerprint: true,
        exportId: true,
        correctedAs: true,
        correctedAt: true,
        export: { select: { lastDownloadedAt: true, importedAt: true } },
      },
    });
    return rows.map(({ export: bankExport, ...line }) => ({ ...line, ...bankExport }));
  }
}
