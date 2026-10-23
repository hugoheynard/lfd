import { BankExportOutdatedError } from "../errors/mandate-bank-export-errors.js";
import type { MandateForBankExport } from "../ports/mandates-for-bank-export.reader.js";
import type {
  ExportedMandateLine,
  KnownMandateLines,
} from "../ports/mandate-bank-exports.reader.js";
import { accountFingerprint } from "./account-fingerprint.js";

/** Un mandat exportable et l'empreinte de son compte ACTUEL. */
export interface FingerprintedMandate {
  readonly mandate: MandateForBankExport;
  readonly fingerprint: string;
}

export interface BankExportSelection {
  /** Ni importés sous leur compte actuel, ni dans un export en vol. */
  readonly toExport: readonly FingerprintedMandate[];
  /** Dans un export préparé, ni importé ni abandonné, sous leur compte actuel. */
  readonly inFlight: readonly FingerprintedMandate[];
  /** Déjà importés sous leur compte actuel. */
  readonly alreadyImported: readonly FingerprintedMandate[];
}

export function fingerprinted(
  mandates: readonly MandateForBankExport[],
): readonly FingerprintedMandate[] {
  return mandates.map((mandate) => ({ mandate, fingerprint: accountFingerprint(mandate.iban) }));
}

/**
 * **« À exporter »** (plan § 2 bis-3) : un mandat l'est s'il n'a AUCUNE ligne
 * portant l'empreinte de son compte actuel, ni dans un export importé, ni
 * dans un export en vol. Ce n'est pas une date sur le mandat : un compte
 * changé — l'amendement, quand il existera — le fait ressortir tout seul.
 *
 * L'export en vol écarte depuis le 2026-10-23 (Hugo, aligné sur les comptes,
 * `account-bank-export-selection.ts`) : sans lui, deux exports préparés avant
 * le premier marquage sortaient les mêmes mandats, et la banque rejetait le
 * second.
 */
export function selectForBankExport(
  mandates: readonly MandateForBankExport[],
  known: KnownMandateLines,
): BankExportSelection {
  const imported = keysOf(known.imported);
  const inFlight = keysOf(known.inFlight);
  const all = fingerprinted(mandates);
  const keyOfEntry = (entry: FingerprintedMandate): string =>
    keyOf(entry.mandate.mandateId, entry.fingerprint);
  const isImported = (entry: FingerprintedMandate): boolean => imported.has(keyOfEntry(entry));
  const isInFlight = (entry: FingerprintedMandate): boolean =>
    !isImported(entry) && inFlight.has(keyOfEntry(entry));
  return {
    toExport: all.filter((entry) => !isImported(entry) && !isInFlight(entry)),
    inFlight: all.filter(isInFlight),
    alreadyImported: all.filter(isImported),
  };
}

function keysOf(lines: readonly ExportedMandateLine[]): ReadonlySet<string> {
  return new Set(lines.map((line) => keyOf(line.mandateId, line.accountFingerprint)));
}

/**
 * Les mandats d'un export **tels qu'ils sont aujourd'hui**, dans l'ordre de
 * l'export — ou un refus nommant chaque RUM dont le compte ne correspond plus,
 * ou qui n'est plus exportable (révoqué, écarté depuis).
 *
 * @throws {BankExportOutdatedError}
 */
export function currentMandatesOf(
  lines: readonly ExportedMandateLine[],
  current: readonly MandateForBankExport[],
): readonly MandateForBankExport[] {
  const byId = new Map(fingerprinted(current).map((entry) => [entry.mandate.mandateId, entry]));
  const outdated = lines.filter((line) => {
    const now = byId.get(line.mandateId);
    return now === undefined || now.fingerprint !== line.accountFingerprint;
  });
  if (outdated.length > 0) {
    throw new BankExportOutdatedError(outdated.map((line) => line.rum));
  }
  return lines.flatMap((line) => {
    const now = byId.get(line.mandateId);
    return now === undefined ? [] : [now.mandate];
  });
}

function keyOf(mandateId: string, fingerprint: string): string {
  return `${mandateId}:${fingerprint}`;
}
