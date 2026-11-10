import type { KnownAccountFingerprints } from "../ports/account-bank-exports.reader.js";
import type { AccountsForBankExport } from "../ports/accounts-for-bank-export.reader.js";
import type { KnownMandateLines } from "../ports/mandate-bank-exports.reader.js";
import type { MandatesForBankExport } from "../ports/mandates-for-bank-export.reader.js";
import type { SepaScheme } from "../value-objects/sepa-scheme.js";
import { selectAccountsForBankExport } from "./account-bank-export-selection.js";
import { selectForBankExport } from "./mandate-bank-export-selection.js";

/**
 * **Le débiteur d'un lot est-il au référentiel de CENET ?** (plan
 * `plan-page-procedure-de-prelevement.md`, P4 révisé le 2026-10-24.)
 *
 * Pour un dépôt de fichier, CENET ne contrôle pas le référentiel des RIB et
 * des mandats (réponse 15 de la banque, `reponses-de-la-banque.md`) : ce
 * calcul AVERTIT, il ne refuse rien. Il ne porte aucune règle propre — chaque
 * état vient des deux sélections des exports (`selectForBankExport`,
 * `selectAccountsForBankExport`), sous l'empreinte du compte ACTUEL du mandat.
 */

/** Le compte destinataire du mandat, vu des exports de comptes (EXC). */
export type DebtorAccountStanding = "known" | "in_export" | "not_exported" | "excluded";

/**
 * Le mandat, vu des exports de mandats (EXM). `excluded` : écarté de
 * l'export (repris, sans compte, sans BIC) ; `inactive` : plus actif.
 */
export type DebtorMandateStanding =
  "imported" | "in_export" | "not_exported" | "excluded" | "inactive";

/** Une ligne d'un lot, telle que ce calcul la lit. */
export interface LotDebtorLine {
  readonly batchId: string;
  readonly scheme: SepaScheme;
  readonly mandateId: string;
  readonly mandateReference: string;
  readonly debtorName: string;
}

/** Un débiteur d'un lot à qui il manque quelque chose au référentiel de CENET. */
export interface LotDebtorGap {
  readonly batchId: string;
  readonly scheme: SepaScheme;
  readonly debtorName: string;
  readonly mandateReference: string;
  /** `null` : le mandat n'a plus de compte actuel à comparer (écarté ou inactif). */
  readonly account: DebtorAccountStanding | null;
  readonly mandate: DebtorMandateStanding;
}

/** Ce que les exports disent de chaque mandat de l'entité. */
export interface BankReferentialStanding {
  readonly mandates: ReadonlyMap<
    string,
    { readonly standing: DebtorMandateStanding; readonly fingerprint: string | null }
  >;
  readonly accounts: ReadonlyMap<string, DebtorAccountStanding>;
}

/** Les deux sélections, rangées par mandat et par empreinte de compte. */
export function bankReferentialStandingOf(
  mandates: MandatesForBankExport,
  known: KnownMandateLines,
  accounts: AccountsForBankExport,
  fingerprints: KnownAccountFingerprints,
): BankReferentialStanding {
  const selection = selectForBankExport(mandates.exportable, known);
  const byMandate = new Map<
    string,
    { readonly standing: DebtorMandateStanding; readonly fingerprint: string | null }
  >();
  for (const entry of mandates.excluded) {
    byMandate.set(entry.mandateId, { standing: "excluded", fingerprint: null });
  }
  const buckets = [
    ["imported", selection.alreadyImported],
    ["in_export", selection.inFlight],
    ["not_exported", selection.toExport],
  ] as const;
  for (const [standing, entries] of buckets) {
    for (const entry of entries) {
      byMandate.set(entry.mandate.mandateId, { standing, fingerprint: entry.fingerprint });
    }
  }
  return { mandates: byMandate, accounts: accountStandings(accounts, fingerprints) };
}

function accountStandings(
  accounts: AccountsForBankExport,
  fingerprints: KnownAccountFingerprints,
): ReadonlyMap<string, DebtorAccountStanding> {
  const selection = selectAccountsForBankExport(accounts.exportable, fingerprints);
  const byFingerprint = new Map<string, DebtorAccountStanding>();
  const buckets = [
    ["known", selection.known],
    ["in_export", selection.inFlight],
    ["not_exported", selection.toExport],
  ] as const;
  for (const [standing, entries] of buckets) {
    for (const entry of entries) {
      byFingerprint.set(entry.fingerprint, standing);
    }
  }
  return byFingerprint;
}

/**
 * Les débiteurs des lots à qui il manque le compte ou le mandat chez CENET —
 * un par (lot, mandat), dans l'ordre des lignes. Un compte qu'aucun export
 * ne connaît sous son empreinte est écarté (sans BIC) : il n'est pas
 * exportable.
 */
export function lotDebtorGaps(
  lines: readonly LotDebtorLine[],
  standing: BankReferentialStanding,
): readonly LotDebtorGap[] {
  const seen = new Set<string>();
  const gaps: LotDebtorGap[] = [];
  for (const line of lines) {
    const key = `${line.batchId}:${line.mandateId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const gap = gapOf(line, standing);
    if (gap !== null) {
      gaps.push(gap);
    }
  }
  return gaps;
}

function gapOf(line: LotDebtorLine, standing: BankReferentialStanding): LotDebtorGap | null {
  const mandate = standing.mandates.get(line.mandateId) ?? {
    standing: "inactive" as const,
    fingerprint: null,
  };
  const account =
    mandate.fingerprint === null
      ? null
      : (standing.accounts.get(mandate.fingerprint) ?? "excluded");
  if (mandate.standing === "imported" && account === "known") {
    return null;
  }
  return {
    batchId: line.batchId,
    scheme: line.scheme,
    debtorName: line.debtorName,
    mandateReference: line.mandateReference,
    account,
    mandate: mandate.standing,
  };
}
