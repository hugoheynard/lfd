import type { SequenceType } from "../services/pain008-document.js";

/**
 * Une ligne du fichier : UN débiteur, le mandat **figé** — IBAN compris — et
 * les commandes qu'elle prélève. Un futur rejet bancaire sur son `endToEndId`
 * sait ainsi quelles commandes il touche (plan §1).
 */
export interface CollectionBatchLine {
  readonly rank: number;
  readonly endToEndId: string;
  readonly mandateId: string;
  readonly mandateReference: string;
  readonly mandateSignedAt: Date;
  /** Le payeur — la société débitée. */
  readonly debtorCompanyId: string;
  readonly debtorName: string;
  /** En clair EN MÉMOIRE seulement : l'adaptateur le scelle à l'écriture. */
  readonly debtorIban: string;
  readonly debtorBic: string | null;
  readonly sequence: SequenceType;
  /** Le total TTC de la facture de ses bons, calculée en une fois (F2). */
  readonly amountCents: number;
  /**
   * Σ des totaux de ses bons — l'écart `amountCents − ordersTotalCents` est
   * celui de la LIGNE, jamais d'un bon. `null` pour une ligne d'un lot
   * constitué avant F2 (2026-10-08) : la colonne n'existait pas, et on
   * n'invente pas sa valeur (plan `le-prelevement-suit-la-facture.md`).
   */
  readonly ordersTotalCents: number | null;
  readonly orderIds: readonly string[];
  /**
   * Les factures émises que la ligne encaisse (E4) — vide pour une ligne
   * d'arrêté et pour les lots d'avant E4. Une facture d'un lot annulé
   * redevient à prélever avec ses bons.
   */
  readonly invoices: readonly BatchLineInvoice[];
  /** Dont commandes d'un cycle antérieur, reprises. */
  readonly priorOrderCount: number;
}

/** Une facture encaissée par une ligne : son id, et le numéro que l'avis cite. */
export interface BatchLineInvoice {
  readonly invoiceId: string;
  readonly number: string;
}
