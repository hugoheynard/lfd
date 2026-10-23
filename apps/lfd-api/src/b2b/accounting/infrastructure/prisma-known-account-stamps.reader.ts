import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { knownBankAccountReason } from "../domain/entities/known-bank-account.js";
import {
  KnownAccountStampsReader,
  type KnownAccountStamp,
} from "../domain/ports/account-bank-exports.reader.js";

/**
 * Depuis quand la banque connaît une empreinte — **sans filtre d'entité**,
 * comme `PrismaKnownAccountFingerprintsReader` (R7) : un compte importé par
 * l'export d'une autre entité de l'abonnement est connu ici aussi.
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
        where: { accountFingerprint, export: { abandonedAt: null, importedAt: { not: null } } },
        select: { accountFingerprint: true, export: { select: { importedAt: true } } },
      }),
      this.prisma.knownBankAccount.findMany({
        where: { accountFingerprint },
        select: { accountFingerprint: true, declaredAt: true, reason: true },
      }),
    ]);
    const stamps = new Map<string, KnownAccountStamp>();
    const keepOldest = (fingerprint: string, stamp: KnownAccountStamp): void => {
      const held = stamps.get(fingerprint);
      if (held === undefined || stamp.at < held.at) {
        stamps.set(fingerprint, stamp);
      }
    };
    for (const line of lines) {
      if (line.export.importedAt !== null) {
        keepOldest(line.accountFingerprint, { kind: "imported", at: line.export.importedAt });
      }
    }
    for (const row of declared) {
      const reason = knownBankAccountReason(row.reason);
      keepOldest(row.accountFingerprint, { kind: "declared", reason, at: row.declaredAt });
    }
    return stamps;
  }
}
