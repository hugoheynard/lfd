import type { MandateBankRowView, MandateBankStandingView } from "@lfd/contracts";

import {
  BANK_LINE_CORRECTIONS,
  isCorrectable,
} from "../../domain/entities/bank-line-correction.js";
import type { MandateBankLineStanding } from "../../domain/ports/mandate-bank-exports.reader.js";
import type {
  MandateExcludedFromBankExport,
  MandateForBankExport,
} from "../../domain/ports/mandates-for-bank-export.reader.js";
import { nameOf } from "../../domain/services/collection-debit-drafts.js";
import { accountFingerprint } from "../../domain/services/account-fingerprint.js";
import { Iban } from "../../domain/value-objects/iban.js";

/**
 * **Les lignes du tableau des mandats** (Hugo, 2026-10-23, aligné sur les
 * comptes) : chaque mandat actif, une fois, avec où il en est sous son compte
 * ACTUEL — une ligne d'un autre compte ne compte pas, comme pour « à
 * exporter ». Parmi les exports déposés, le plus récent fait foi ; une ligne
 * rejetée par le compte rendu ne compte plus. Les écartés à la fin.
 */
export function mandateBankRows(
  exportable: readonly MandateForBankExport[],
  excluded: readonly MandateExcludedFromBankExport[],
  lines: readonly MandateBankLineStanding[],
  names: ReadonlyMap<string, string>,
  now: Date,
): readonly MandateBankRowView[] {
  const live = lines.filter((line) => line.correctedAs !== BANK_LINE_CORRECTIONS.rejected);
  return [
    ...exportable.map((mandate) => {
      const fingerprint = accountFingerprint(mandate.iban);
      const own = live.filter(
        (line) => line.mandateId === mandate.mandateId && line.accountFingerprint === fingerprint,
      );
      return {
        mandateId: mandate.mandateId,
        reference: mandate.reference,
        debtorName: nameOf(mandate.debtorCompanyId, names),
        ibanLast4: Iban.create(mandate.iban).last4(),
        standing: standingOf(own, now),
      };
    }),
    ...excluded.map((mandate) => ({
      mandateId: mandate.mandateId,
      reference: mandate.reference,
      debtorName: nameOf(mandate.debtorCompanyId, names),
      ibanLast4: null,
      standing: { kind: "excluded", reason: mandate.reason } as const,
    })),
  ];
}

function standingOf(own: readonly MandateBankLineStanding[], now: Date): MandateBankStandingView {
  const deposited = own.flatMap((line) =>
    line.importedAt === null ? [] : [{ line, importedAt: line.importedAt }],
  );
  const latest = deposited.sort((a, b) => b.importedAt.getTime() - a.importedAt.getTime())[0];
  if (latest !== undefined) {
    const { line, importedAt } = latest;
    if (line.correctedAs === BANK_LINE_CORRECTIONS.reportedByBank && line.correctedAt !== null) {
      return { kind: "reported_by_bank", at: line.correctedAt.toISOString() };
    }
    return {
      kind: "imported",
      at: importedAt.toISOString(),
      exportId: line.exportId,
      correctable: isCorrectable(importedAt, null, now),
    };
  }
  const open = own.find((line) => line.importedAt === null);
  return open === undefined
    ? { kind: "to_export" }
    : { kind: "in_flight", exportId: open.exportId, downloaded: open.lastDownloadedAt !== null };
}
