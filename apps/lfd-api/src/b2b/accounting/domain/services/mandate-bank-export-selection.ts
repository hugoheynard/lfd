import { BankExportOutdatedError } from "../errors/mandate-bank-export-errors.js";
import type { MandateForBankExport } from "../ports/mandates-for-bank-export.reader.js";
import type { ExportedMandateLine } from "../ports/mandate-bank-exports.reader.js";
import { accountFingerprint } from "./account-fingerprint.js";

/** Un mandat exportable et l'empreinte de son compte ACTUEL. */
export interface FingerprintedMandate {
  readonly mandate: MandateForBankExport;
  readonly fingerprint: string;
}

export interface BankExportSelection {
  /** Ce que la banque n'a pas — ou n'a pas sous ce compte. */
  readonly toExport: readonly FingerprintedMandate[];
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
 * d'un export importé portant l'empreinte de son compte actuel. Ce n'est pas
 * une date sur le mandat : un compte changé — l'amendement, quand il existera
 * — le fait ressortir tout seul, sans qu'on ait rien à remettre à zéro.
 *
 * @param imported les lignes des exports MARQUÉS importés de l'entité.
 */
export function selectForBankExport(
  mandates: readonly MandateForBankExport[],
  imported: readonly ExportedMandateLine[],
): BankExportSelection {
  const known = new Set(imported.map((line) => keyOf(line.mandateId, line.accountFingerprint)));
  const all = fingerprinted(mandates);
  const isImported = (entry: FingerprintedMandate): boolean =>
    known.has(keyOf(entry.mandate.mandateId, entry.fingerprint));
  return {
    toExport: all.filter((entry) => !isImported(entry)),
    alreadyImported: all.filter(isImported),
  };
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
