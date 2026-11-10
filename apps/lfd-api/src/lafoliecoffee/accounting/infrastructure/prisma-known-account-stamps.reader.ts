import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { BANK_LINE_CORRECTIONS } from "../domain/entities/bank-line-correction.js";
import { knownBankAccountReason } from "../domain/entities/known-bank-account.js";
import {
  KnownAccountStampsReader,
  type KnownAccountStamp,
} from "../domain/ports/account-bank-exports.reader.js";
import { NOT_REJECTED } from "./bank-line-correction.mapper.js";

/**
 * Depuis quand la banque connaît une empreinte — **sans filtre d'entité**,
 * comme `PrismaKnownAccountFingerprintsReader` (R7) : un compte importé par
 * l'export d'une autre entité de l'abonnement est connu ici aussi.
 *
 * Parmi les exports déposés, le PLUS RÉCENT fait foi : c'est son compte rendu
 * qu'on reporte (Hugo, 2026-10-23). Une ligne rejetée ne compte pas ; une
 * ligne « signalée connue » se lit comme une déclaration `reported_by_bank`.
 * Entre une déclaration et un import, le plus ancien l'emporte.
 */
@Injectable()
export class PrismaKnownAccountStampsReader extends KnownAccountStampsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async stampsOf(fingerprints: readonly string[]): Promise<ReadonlyMap<string, KnownAccountStamp>> {
    const accountFingerprint = { in: [...fingerprints] };
    const [lines, declared] = await Promise.all([
      this.prisma.accountBankExportLine.findMany({
        where: {
          accountFingerprint,
          export: { abandonedAt: null, importedAt: { not: null } },
          ...NOT_REJECTED,
        },
        select: {
          accountFingerprint: true,
          exportId: true,
          correctedAs: true,
          correctedAt: true,
          export: { select: { importedAt: true } },
        },
      }),
      this.prisma.knownBankAccount.findMany({
        where: { accountFingerprint },
        select: { accountFingerprint: true, declaredAt: true, reason: true },
      }),
    ]);
    const stamps = new Map<string, KnownAccountStamp>();
    for (const line of lines) {
      const stamp = lineStamp(line);
      const held = stamps.get(line.accountFingerprint);
      if (stamp !== null && (held === undefined || stamp.at > held.at)) {
        stamps.set(line.accountFingerprint, stamp);
      }
    }
    for (const row of declared) {
      const held = stamps.get(row.accountFingerprint);
      if (held === undefined || row.declaredAt < held.at) {
        const reason = knownBankAccountReason(row.reason);
        stamps.set(row.accountFingerprint, { kind: "declared", reason, at: row.declaredAt });
      }
    }
    return stamps;
  }
}

interface StampedLine {
  readonly exportId: string;
  readonly correctedAs: string | null;
  readonly correctedAt: Date | null;
  readonly export: { readonly importedAt: Date | null };
}

function lineStamp(line: StampedLine): KnownAccountStamp | null {
  if (line.correctedAs === BANK_LINE_CORRECTIONS.reportedByBank && line.correctedAt !== null) {
    return { kind: "declared", reason: "reported_by_bank", at: line.correctedAt };
  }
  return line.export.importedAt === null
    ? null
    : { kind: "imported", at: line.export.importedAt, exportId: line.exportId };
}
