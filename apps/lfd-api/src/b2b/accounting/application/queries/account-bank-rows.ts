import type { AccountBankRowView, AccountBankStandingView } from "@lfd/contracts";

import { isCorrectable } from "../../domain/entities/bank-line-correction.js";
import type { KnownAccountStamp } from "../../domain/ports/account-bank-exports.reader.js";
import type { AccountExcludedFromBankExport } from "../../domain/ports/accounts-for-bank-export.reader.js";
import type {
  AccountBankExportSelection,
  FingerprintedAccount,
} from "../../domain/services/account-bank-export-selection.js";

/** Un IBAN commence par le code pays de sa banque. */
const IBAN_COUNTRY_LENGTH = 2;

/**
 * **Les lignes du tableau de la carte** : chaque compte débité, une fois,
 * avec où il en est — dans l'ordre de dépôt, les écartés à la fin. Un compte
 * connu sans tampon (sa déclaration ou son import a disparu entre deux
 * lectures) se lit « en vol » plutôt que d'inventer une date : il ne l'est
 * pas, mais il n'est pas non plus à exporter, et la relecture le corrige.
 * Un compte en vol dit si son export a été téléchargé : avant, aucun geste
 * n'a de sens sur lui (doc § 2.6). Un compte importé dit de quel export, et
 * si le compte rendu CENET peut encore s'y reporter (Hugo, 2026-10-23).
 */
export function accountBankRows(
  selection: AccountBankExportSelection,
  excluded: readonly AccountExcludedFromBankExport[],
  stamps: ReadonlyMap<string, KnownAccountStamp>,
  inDownloadedExport: ReadonlySet<string>,
  now: Date,
): readonly AccountBankRowView[] {
  const toExport = new Set(selection.toExport);
  const inFlight = new Set(selection.inFlight);
  const standingOf = (entry: FingerprintedAccount): AccountBankStandingView => {
    if (toExport.has(entry)) {
      return { kind: "to_export" };
    }
    const stamp = stamps.get(entry.fingerprint);
    if (inFlight.has(entry) || stamp === undefined) {
      return { kind: "in_flight", downloaded: inDownloadedExport.has(entry.fingerprint) };
    }
    return stamp.kind === "imported"
      ? {
          kind: "imported",
          at: stamp.at.toISOString(),
          exportId: stamp.exportId,
          correctable: isCorrectable(stamp.at, null, now),
        }
      : { kind: "declared", reason: stamp.reason, at: stamp.at.toISOString() };
  };
  const debited = [...selection.toExport, ...selection.inFlight, ...selection.known]
    .sort(
      (a, b) =>
        a.account.recordedAt.getTime() - b.account.recordedAt.getTime() ||
        a.account.bankAccountId.localeCompare(b.account.bankAccountId),
    )
    .map((entry) => ({
      bankAccountId: entry.account.bankAccountId,
      companyName: entry.account.companyName,
      tradeName: entry.account.tradeName,
      holder: entry.account.holder,
      ibanCountry: entry.account.iban.slice(0, IBAN_COUNTRY_LENGTH),
      ibanLast4: entry.account.ibanLast4,
      bic: entry.account.bic,
      standing: standingOf(entry),
    }));
  return [
    ...debited,
    ...excluded.map((account) => ({
      bankAccountId: account.bankAccountId,
      companyName: account.companyName,
      tradeName: account.tradeName,
      holder: account.holder,
      ibanCountry: account.ibanCountry,
      ibanLast4: account.ibanLast4,
      bic: null,
      standing: { kind: "excluded", reason: account.reason } as const,
    })),
  ];
}
