import { BusinessError, TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/**
 * On demande de quoi régler une commande **annulée**. Refus métier (409) : la
 * commande existe et reste lisible, mais elle ne sera ni produite ni encaissée
 * — servir un formulaire de carte ferait payer ce qui ne sera pas livré.
 *
 * Rangé à part de `order-errors.ts`, déjà au-delà des 300 lignes.
 */
export class CancelledOrderNotPayableError extends BusinessError {
  constructor(readonly orderId: string) {
    super(
      "orders.payment.order_cancelled",
      "Cette commande a été annulée : elle n'est plus à régler et ne sera pas préparée. " +
        "Passez une nouvelle commande si vous en avez toujours besoin.",
    );
  }
}

/** Les deux états d'intention qui ne se paient plus (cf. `PaymentIntentState`). */
export type ClosedIntentState = "succeeded" | "canceled";

/**
 * L'intention de paiement de la commande est **close chez le prestataire**,
 * alors que notre base la croit encore en attente. Refus métier (409).
 *
 * - `succeeded` — l'argent est reçu, la confirmation n'est pas encore arrivée
 *   jusqu'à nous : payer à nouveau serait débiter deux fois.
 * - `canceled` — l'intention est morte (abandon, ou clôture de la journée dont
 *   l'écriture n'a pas abouti chez nous) : son secret ne mène qu'à une erreur.
 */
export class PaymentIntentClosedError extends BusinessError {
  constructor(readonly state: ClosedIntentState) {
    super(
      "orders.payment.intent_closed",
      state === "succeeded"
        ? "Le paiement de cette commande a déjà été reçu ; sa confirmation arrive dans " +
            "quelques instants. Ne payez pas une seconde fois."
        : "Le paiement de cette commande a été annulé et ne peut plus être repris. " +
            "Passez une nouvelle commande, ou contactez-nous si vous pensez qu'il s'agit d'une erreur.",
    );
  }
}

/**
 * La commande porte une intention que le bloc `card-payment` ne connaît pas
 * encore : elle a été créée par l'image d'avant le bloc (plan M2, §4.6). Une
 * lecture n'écrit rien (409) — l'écran envoie l'adoption
 * (`POST /orders/:id/payment/adopt`) puis relit ; le rattrapage horaire la
 * fait aussi, seul, dans l'heure.
 */
export class OrderPaymentAwaitsAdoptionError extends BusinessError {
  constructor(readonly orderId: string) {
    super(
      "orders.payment.awaits_adoption",
      "Le paiement de cette commande a été ouvert avant la dernière mise à jour et doit " +
        "être repris avant d'être réglé. Rechargez la page ; si le message revient, " +
        "réessayez dans une heure ou contactez-nous.",
    );
  }
}

/**
 * Le bloc `card-payment` annonce un paiement pour une commande qui ne porte
 * aucune intention — incohérence de base (500) : une ligne de paiement ne naît
 * que dans la transaction de la passation qui a posé l'intention.
 */
export class OrderCardSubjectWithoutIntentError extends TechnicalError {
  constructor(readonly orderId: string) {
    super(
      "orders.payment.subject_without_intent",
      `La commande ${orderId} reçoit un paiement par carte sans porter d'intention : ` +
        "rapprocher à la main la commande et le paiement chez Stripe.",
    );
  }
}
