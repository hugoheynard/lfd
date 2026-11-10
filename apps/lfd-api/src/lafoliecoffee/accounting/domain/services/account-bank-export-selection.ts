import { AccountBankExportOutdatedError } from "../errors/account-bank-export-errors.js";
import type {
  ExportedAccountLine,
  KnownAccountFingerprints,
} from "../ports/account-bank-exports.reader.js";
import type { AccountForBankExport } from "../ports/accounts-for-bank-export.reader.js";
import { accountFingerprint } from "./account-fingerprint.js";

/** Un compte exportable et l'empreinte de son IBAN ACTUEL. */
export interface FingerprintedAccount {
  readonly account: AccountForBankExport;
  readonly fingerprint: string;
}

export interface AccountBankExportSelection {
  /** Ni connus de la banque, ni dans un export en vol — dans l'ordre de dépôt. */
  readonly toExport: readonly FingerprintedAccount[];
  /** Dans un export préparé, ni importé ni abandonné. */
  readonly inFlight: readonly FingerprintedAccount[];
  /** Importés, ou déclarés « déjà connu ». */
  readonly known: readonly FingerprintedAccount[];
}

/** Une ligne d'export non abandonnée et non rejetée, et où en est son export. */
export interface ExportedFingerprint {
  readonly accountFingerprint: string;
  readonly importedAt: Date | null;
  readonly lastDownloadedAt: Date | null;
}

/**
 * **Ce que la banque a, ou va avoir** : une ligne d'un export importé rend son
 * compte connu, celle d'un export pas encore importé le met en vol — et en vol
 * « téléchargé » si le fichier est déjà sorti. Les comptes déclarés « déjà
 * connu » le sont d'emblée. Sorti de l'adaptateur le 2026-10-23.
 */
export function knownAccountFingerprintsOf(
  lines: readonly ExportedFingerprint[],
  declared: readonly string[],
): KnownAccountFingerprints {
  const known = new Set(declared);
  const inFlight = new Set<string>();
  const inDownloadedExport = new Set<string>();
  for (const line of lines) {
    (line.importedAt === null ? inFlight : known).add(line.accountFingerprint);
    if (line.importedAt === null && line.lastDownloadedAt !== null) {
      inDownloadedExport.add(line.accountFingerprint);
    }
  }
  return { known, inFlight, inDownloadedExport };
}

/**
 * Une empreinte par compte, et un compte par empreinte (R5) : deux RIB au même
 * IBAN — un site qui l'a ressaisi — ne font qu'une ligne, le plus ancien.
 * Triés par dépôt du RIB puis par id : l'ordre stable des 200 premiers (§ 2.2).
 */
export function fingerprintedAccounts(
  accounts: readonly AccountForBankExport[],
): readonly FingerprintedAccount[] {
  const sorted = [...accounts].sort(
    (a, b) =>
      a.recordedAt.getTime() - b.recordedAt.getTime() ||
      a.bankAccountId.localeCompare(b.bankAccountId),
  );
  const byFingerprint = new Map<string, FingerprintedAccount>();
  for (const account of sorted) {
    const fingerprint = accountFingerprint(account.iban);
    if (!byFingerprint.has(fingerprint)) {
      byFingerprint.set(fingerprint, { account, fingerprint });
    }
  }
  return [...byFingerprint.values()];
}

/**
 * **« À exporter »** (§ 2.1) : un compte l'est si son empreinte n'est ni dans
 * un export importé, ni dans un export en vol, ni déclarée « déjà connu ».
 * Sans les deux derniers, deux exports préparés avant le premier marquage
 * sortiraient les mêmes comptes, et le second serait rejeté en entier.
 */
export function selectAccountsForBankExport(
  accounts: readonly AccountForBankExport[],
  fingerprints: KnownAccountFingerprints,
): AccountBankExportSelection {
  const all = fingerprintedAccounts(accounts);
  const isKnown = (entry: FingerprintedAccount): boolean =>
    fingerprints.known.has(entry.fingerprint);
  const isInFlight = (entry: FingerprintedAccount): boolean =>
    !isKnown(entry) && fingerprints.inFlight.has(entry.fingerprint);
  return {
    toExport: all.filter((entry) => !isKnown(entry) && !isInFlight(entry)),
    inFlight: all.filter(isInFlight),
    known: all.filter(isKnown),
  };
}

/**
 * Les comptes d'un export **tels qu'ils sont aujourd'hui**, dans l'ordre de
 * l'export — ou un refus nommant chaque société dont le RIB ne correspond
 * plus à l'empreinte figée, ou n'est plus débité par un mandat actif.
 *
 * @throws {AccountBankExportOutdatedError}
 */
export function currentAccountsOf(
  lines: readonly ExportedAccountLine[],
  current: readonly AccountForBankExport[],
): readonly AccountForBankExport[] {
  const byFingerprint = new Map(
    fingerprintedAccounts(current).map((entry) => [entry.fingerprint, entry.account]),
  );
  const outdated = lines.filter((line) => !byFingerprint.has(line.accountFingerprint));
  if (outdated.length > 0) {
    const names = new Map(current.map((account) => [account.companyId, account.companyName]));
    throw new AccountBankExportOutdatedError(
      outdated.map((line) => names.get(line.companyId) ?? line.companyId),
    );
  }
  return lines.flatMap((line) => {
    const now = byFingerprint.get(line.accountFingerprint);
    return now === undefined ? [] : [now];
  });
}
