import type { CardRefundLedger } from "../entities/card-refund-ledger.js";
import type { PaymentSubject } from "../value-objects/payment-subject.js";

/**
 * **Le port d'écriture du carnet** (plan M2, §3.4, §6.3) : charger le carnet
 * d'un paiement sous le verrou de sa ligne, le sauver. Aucune écriture
 * ciblée : le statut d'un remboursement ne bouge que par
 * {@link CardRefundLedger.record}.
 */
export abstract class CardRefundLedgerRepository {
  /**
   * Le sujet d'un paiement, **sans verrou** — lu AVANT `lockSubject`, pour
   * savoir quel sujet verrouiller. Sans risque : le sujet d'un paiement est
   * immuable (déclencheur `payment_guard`).
   */
  abstract subjectOf(paymentId: string): Promise<PaymentSubject | null>;

  /**
   * Le carnet du paiement, **sous verrou** de la ligne `payment` (`FOR
   * UPDATE`) : deux constats concurrents ne lisent pas tous deux un cumul qui
   * ne compte pas l'autre. À appeler dans une unité de travail, après
   * `lockSubject`.
   */
  abstract loadByPayment(paymentId: string): Promise<CardRefundLedger | null>;

  /** Écrit les lignes neuves et les statuts changés. */
  abstract save(ledger: CardRefundLedger): Promise<void>;
}
