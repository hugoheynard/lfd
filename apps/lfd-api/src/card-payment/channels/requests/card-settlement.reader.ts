import type { CardSubject, SubjectPaymentRole, SubjectSettledState } from "../subjects/index.js";

/** Un paiement d'un sujet, tel que la position le rend. */
export interface CardPaymentLine {
  readonly paymentId: string;
  readonly account: string;
  readonly providerRef: string | null;
  readonly role: SubjectPaymentRole;
  readonly state: SubjectSettledState;
  readonly amountCents: number;
  readonly paidAt: Date | null;
}

/**
 * **La position carte d'un sujet** (plan M2, §3.3).
 *
 * ⚠️ **P0 : les paiements seuls.** Les champs du remboursement — remboursé
 * par nature, demandes non terminales, en vol par forme — arrivent avec le
 * remboursement, en P1 (§3.3, §5). Un sujet sans paiement est rendu avec une
 * liste vide : c'est au commerce d'appeler `adopt` (§4.6).
 */
export interface CardSettlementPosition {
  readonly subject: CardSubject;
  /** Du plus ancien au plus récent. */
  readonly payments: readonly CardPaymentLine[];
  /** **Encaissé** : `Σ montant` des paiements `paid`, en centimes. */
  readonly chargedCents: number;
}

/**
 * **Lire l'argent carte de sujets, par lot** (plan M2, §3.3) — déclaré ET
 * implémenté par `card-payment`. 🔴 N'écrit JAMAIS (§4.6) : un sujet sans
 * ligne y est rendu tel quel.
 */
export abstract class CardSettlementReader {
  /** Une position par sujet demandé, dans l'ordre de la demande. */
  abstract positionOf(subjects: readonly CardSubject[]): Promise<readonly CardSettlementPosition[]>;
}
