import {
  BankExportNotDepositedError,
  BankLineAlreadyCorrectedError,
  BankRejectionReasonError,
  BankReportWindowClosedError,
  type BankReportSubject,
} from "../errors/bank-report-errors.js";
import type { StaffStamp } from "./collection-batch.js";

/**
 * **Ce que le compte rendu d'import CENET dit d'une ligne** (Hugo
 * 2026-10-23). Des VALEURS : rangées en base (CHECK) et au journal.
 */
export const BANK_LINE_CORRECTIONS = {
  /** La banque l'avait déjà : la ligne reste tenue pour connue. */
  reportedByBank: "reported_by_bank",
  /** Ligne en erreur : elle ne compte plus pour connue, et repart à exporter. */
  rejected: "rejected",
} as const;

export type BankLineCorrectionKind =
  (typeof BANK_LINE_CORRECTIONS)[keyof typeof BANK_LINE_CORRECTIONS];

export interface BankLineCorrection {
  readonly kind: BankLineCorrectionKind;
  readonly stamp: StaffStamp;
  /** Le motif, pour un rejet seulement. */
  readonly rejectionReason: string | null;
}

/** Longueur de motif que la base accepte (CHECK). */
export const REJECTION_REASON_MAX_LENGTH = 200;

/**
 * **La fenêtre du compte rendu** : trente jours après le dépôt. Choisie
 * plutôt que « tant que l'export est le dernier déposé » : deux fichiers
 * déposés le même jour se fermeraient l'un l'autre avant qu'on ait lu le
 * premier compte rendu, et la règle demanderait de lire les autres exports.
 * CENET rend son compte rendu dans la journée ; trente jours couvrent un
 * mois de congés sans laisser une ligne corrigeable indéfiniment.
 */
export const BANK_REPORT_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

/** Jusqu'à quand le compte rendu d'un export déposé à `importedAt` se reporte. */
export function bankReportClosesAt(importedAt: Date): Date {
  return new Date(importedAt.getTime() + BANK_REPORT_WINDOW_DAYS * DAY_MS);
}

/** @throws {BankRejectionReasonError} */
export function rejectionReason(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > REJECTION_REASON_MAX_LENGTH) {
    throw new BankRejectionReasonError(REJECTION_REASON_MAX_LENGTH);
  }
  return trimmed;
}

/**
 * Les gardes communes aux deux exports, une fois la ligne trouvée et
 * l'export ni abandonné : déposé, dans la fenêtre, pas encore corrigé.
 *
 * @throws {BankExportNotDepositedError}
 * @throws {BankReportWindowClosedError}
 * @throws {BankLineAlreadyCorrectedError}
 */
export function assertCorrectable(
  subject: BankReportSubject,
  imported: StaffStamp | null,
  current: BankLineCorrection | null,
  at: Date,
): void {
  if (imported === null) {
    throw new BankExportNotDepositedError(subject);
  }
  const closesAt = bankReportClosesAt(imported.at);
  if (at > closesAt) {
    throw new BankReportWindowClosedError(subject, closesAt);
  }
  if (current !== null) {
    throw new BankLineAlreadyCorrectedError(subject, current.stamp.at);
  }
}

/** Une ligne d'un export déposé peut-elle encore recevoir une correction ? */
export function isCorrectable(
  imported: Date | null,
  current: BankLineCorrectionKind | null,
  at: Date,
): boolean {
  return imported !== null && current === null && at <= bankReportClosesAt(imported);
}

const KINDS: ReadonlySet<string> = new Set(Object.values(BANK_LINE_CORRECTIONS));

export function isBankLineCorrectionKind(value: string): value is BankLineCorrectionKind {
  return KINDS.has(value);
}
