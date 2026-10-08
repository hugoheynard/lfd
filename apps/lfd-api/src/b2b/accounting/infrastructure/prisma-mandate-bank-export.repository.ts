import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { MandateBankExport } from "../domain/entities/mandate-bank-export.js";
import { MandateBankExportRepository } from "../domain/ports/mandate-bank-export.repository.js";

/**
 * Adaptateur d'écriture de l'export des mandats. Les LIGNES s'écrivent à la
 * création et jamais ensuite ; un `save` ultérieur ne pose que « importé ».
 * Aucun IBAN ne passe ici : une ligne n'en porte que l'empreinte.
 */
@Injectable()
export class PrismaMandateBankExportRepository extends MandateBankExportRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(legalEntityId: string, exportId: string): Promise<MandateBankExport | null> {
    const row = await this.prisma.mandateBankExport.findFirst({
      where: { id: exportId, legalEntityId },
      include: { lines: { orderBy: { rum: "asc" } } },
    });
    if (row === null) {
      return null;
    }
    return MandateBankExport.rehydrate({
      id: row.id,
      legalEntityId: row.legalEntityId,
      created: { at: row.createdAt, staffId: row.createdByStaffId },
      lines: row.lines.map((line) => ({
        mandateId: line.mandateId,
        rum: line.rum,
        accountFingerprint: line.accountFingerprint,
      })),
      imported:
        row.importedAt === null || row.importedByStaffId === null
          ? null
          : { at: row.importedAt, staffId: row.importedByStaffId },
    });
  }

  async save(bankExport: MandateBankExport): Promise<void> {
    const state = bankExport.toPersistence();
    const imported = {
      importedAt: state.imported?.at ?? null,
      importedByStaffId: state.imported?.staffId ?? null,
    };
    const exists = await this.prisma.mandateBankExport.findFirst({
      where: { id: state.id, legalEntityId: state.legalEntityId },
      select: { id: true },
    });
    if (exists !== null) {
      await this.prisma.mandateBankExport.update({ where: { id: state.id }, data: imported });
      return;
    }
    await this.prisma.mandateBankExport.create({
      data: {
        id: state.id,
        legalEntityId: state.legalEntityId,
        createdAt: state.created.at,
        createdByStaffId: state.created.staffId,
        mandateCount: state.lines.length,
        ...imported,
      },
    });
    await this.prisma.mandateBankExportLine.createMany({
      data: state.lines.map((line) => ({
        exportId: state.id,
        mandateId: line.mandateId,
        rum: line.rum,
        accountFingerprint: line.accountFingerprint,
      })),
    });
  }
}
