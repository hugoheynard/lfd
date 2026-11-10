import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { partFromRow, partToRow } from "./bank-export-naming.mapper.js";
import {
  AccountBankExport,
  type AccountBankExportState,
} from "../domain/entities/account-bank-export.js";
import type { KnownBankAccount } from "../domain/entities/known-bank-account.js";
import type { StaffStamp } from "../domain/entities/collection-batch.js";
import { correctionFromRow, correctionToRow } from "./bank-line-correction.mapper.js";
import {
  AccountBankExportRepository,
  KnownBankAccountRepository,
} from "../domain/ports/account-bank-export.repository.js";

/**
 * Adaptateur d'écriture de l'export des comptes. Les LIGNES s'écrivent à la
 * création ; un `save` ultérieur ne pose que le dernier téléchargement,
 * « importé », « abandonné », et la correction CENET de chaque ligne. Aucun IBAN ne passe ici : une ligne n'en porte que l'empreinte.
 */
@Injectable()
export class PrismaAccountBankExportRepository extends AccountBankExportRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(legalEntityId: string, exportId: string): Promise<AccountBankExport | null> {
    const row = await this.prisma.accountBankExport.findFirst({
      where: { id: exportId, legalEntityId },
      include: { lines: { orderBy: { accountFingerprint: "asc" } } },
    });
    if (row === null) {
      return null;
    }
    return AccountBankExport.rehydrate({
      id: row.id,
      reference: row.reference,
      part: partFromRow(row),
      legalEntityId: row.legalEntityId,
      created: { at: row.createdAt, staffId: row.createdByStaffId },
      lines: row.lines.map((line) => ({
        bankAccountId: line.bankAccountId,
        companyId: line.companyId,
        accountFingerprint: line.accountFingerprint,
        correction: correctionFromRow(line),
      })),
      lastDownloadedAt: row.lastDownloadedAt,
      imported: stampOf(row.importedAt, row.importedByStaffId),
      abandoned: stampOf(row.abandonedAt, row.abandonedByStaffId),
    });
  }

  async save(bankExport: AccountBankExport): Promise<void> {
    const state = bankExport.toPersistence();
    const closed = {
      lastDownloadedAt: state.lastDownloadedAt,
      importedAt: state.imported?.at ?? null,
      importedByStaffId: state.imported?.staffId ?? null,
      abandonedAt: state.abandoned?.at ?? null,
      abandonedByStaffId: state.abandoned?.staffId ?? null,
    };
    const exists = await this.prisma.accountBankExport.findFirst({
      where: { id: state.id, legalEntityId: state.legalEntityId },
      select: { id: true },
    });
    if (exists !== null) {
      await this.prisma.accountBankExport.update({ where: { id: state.id }, data: closed });
      await this.saveCorrections(state.id, state.lines);
      return;
    }
    await this.prisma.accountBankExport.create({
      data: {
        id: state.id,
        reference: state.reference,
        ...partToRow(state.part),
        legalEntityId: state.legalEntityId,
        createdAt: state.created.at,
        createdByStaffId: state.created.staffId,
        accountCount: state.lines.length,
        ...closed,
      },
    });
    await this.prisma.accountBankExportLine.createMany({
      data: state.lines.map(({ correction, ...line }) => ({
        exportId: state.id,
        ...line,
        ...correctionToRow(correction),
      })),
    });
  }

  /** Les corrections du compte rendu CENET — seules les lignes qui en portent une. */
  private async saveCorrections(
    exportId: string,
    lines: AccountBankExportState["lines"],
  ): Promise<void> {
    for (const line of lines.filter((row) => row.correction !== null)) {
      await this.prisma.accountBankExportLine.update({
        where: {
          exportId_accountFingerprint: { exportId, accountFingerprint: line.accountFingerprint },
        },
        data: correctionToRow(line.correction),
      });
    }
  }
}

/** Les déclarations « déjà connu » : posées une fois, jamais modifiées. */
@Injectable()
export class PrismaKnownBankAccountRepository extends KnownBankAccountRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async add(account: KnownBankAccount): Promise<void> {
    const state = account.toPersistence();
    await this.prisma.knownBankAccount.create({
      data: {
        id: state.id,
        accountFingerprint: state.accountFingerprint,
        bankAccountId: state.bankAccountId,
        companyId: state.companyId,
        legalEntityId: state.legalEntityId,
        declaredAt: state.declared.at,
        declaredByStaffId: state.declared.staffId,
        reason: state.reason,
      },
    });
  }
}

function stampOf(at: Date | null, staffId: string | null): StaffStamp | null {
  return at === null || staffId === null ? null : { at, staffId };
}
