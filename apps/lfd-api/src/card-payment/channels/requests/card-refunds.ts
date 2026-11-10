import type {
  CardRefundForm,
  CardRefundNature,
  CardRefundRequestState,
} from "../../domain/value-objects/card-refund-values.js";
import type { CardSubject } from "../subjects/index.js";

/**
 * Quand l'exécuteur prend la demande : tout de suite après validation
 * (`now`), ou jamais seul — elle naît arrêtée et attend le bouton (`button`,
 * l'inversion : Q3, « jamais une relance seule »).
 */
export type CardRefundSchedule = "now" | "button";

/** Ce qu'on rembourse : un paiement nommé, ou tous les paiements encaissés d'un sujet. */
export type CardRefundTarget = { readonly paymentId: string } | { readonly subject: CardSubject };

/** La demande du reste, telle que le sujet la décrit. */
export interface RemainderRefundRequest {
  readonly nature: CardRefundNature;
  /** Un code du sujet (`cancellation`, `paid_after_cancellation`…), 1 à 64 caractères. */
  readonly reason: string;
  readonly schedule: CardRefundSchedule;
  /** La fiche staff qui l'a décidée ; `null` pour une demande automatique. */
  readonly requestedBy: string | null;
}

/** La demande d'un montant (une baisse, S1). */
export interface AmountRefundRequest {
  readonly paymentId: string;
  readonly amountCents: number;
  readonly nature: CardRefundNature;
  readonly reason: string;
  readonly requestedBy: string | null;
}

/** Une demande, telle que la rend `CardRefunds`. */
export interface RequestedCardRefund {
  readonly requestId: string;
  readonly paymentId: string;
  readonly form: CardRefundForm;
  readonly announcedCents: number;
  readonly state: CardRefundRequestState;
}

/**
 * **Rembourser par carte** (plan M2, §3.3) — déclaré ET implémenté par
 * `card-payment`, appelé par l'annulation, la baisse, le refus d'une hausse,
 * l'inversion et « Relancer ».
 *
 * 🔴 **Dans la transaction de l'appelant**, qui a pris le verrou de son sujet
 * (§3.6) ; chaque geste rappelle `lockSubject` (idempotent) puis verrouille
 * ses lignes. Un refus est décidé AVANT toute écriture (§3.3, v10) : un
 * abonné durable peut l'absorber sans que la transaction du reçu soit perdue.
 * L'exécuteur part après validation : aucun appel au prestataire ici.
 */
export abstract class CardRefunds {
  /**
   * **Rendre le reste.** Idempotent : rend la `remainder` EN COURS du paiement
   * (`to_issue | issued`), sinon la crée ; pour `button`, une `stopped`
   * existante est rendue telle quelle (le bouton la relancera). Pour un sujet :
   * une `remainder` par paiement encaissé qui a encore un reste, du dernier
   * au premier — l'appelant n'a pas à connaître les `paymentId`.
   *
   * @throws {CardPaymentNotFoundError} paiement inconnu.
   * @throws {CardRefundPaymentNotPaidError} paiement nommé jamais encaissé.
   * @throws {CardRefundNothingLeftError} paiement nommé sans reste à rendre.
   */
  abstract requestRemainder(
    target: CardRefundTarget,
    request: RemainderRefundRequest,
  ): Promise<readonly RequestedCardRefund[]>;

  /**
   * **Rendre un montant**, pris tout de suite par l'exécuteur.
   *
   * @throws {CardPaymentNotFoundError} paiement inconnu.
   * @throws {CardRefundPaymentNotPaidError} paiement jamais encaissé.
   * @throws {CardRefundAmountExceedsRemainderError} au-delà de ce qui reste.
   */
  abstract requestAmount(request: AmountRefundRequest): Promise<RequestedCardRefund>;

  /**
   * **« Relancer »** une demande (§3.4) ; l'exécuteur part après validation.
   *
   * @throws {CardRefundRequestNotFoundError} demande inconnue.
   * @throws {CardRefundRetryRefusedError} la règle de « Relancer » la refuse.
   */
  abstract retry(requestId: string): Promise<void>;
}
