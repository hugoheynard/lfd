import type { DurableEvent, DurableFact } from "../../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/** Nom STABLE du fait, clé de routage vers `@DurableHandler`. */
export const ORDER_REVIEW_WITHDRAWN = "order.review_withdrawn";

/**
 * **« Le visa de la commande est retiré »** — fait DURABLE, écrit par
 * `WithdrawOrderReviewHandler` dans l'unité de travail qui pose `withdrawn_*`.
 * Abonné : le journal (`order.review_withdrawn`). Retirer ne « désacquitte » aucune alerte : une alerte vue l'a été. Clé
 * `…:<reviewId>` : un visa ne se retire qu'une fois.
 */
export class OrderReviewWithdrawnFact implements DurableEvent {
  constructor(
    readonly reviewId: string,
    readonly orderId: string,
    readonly orderNumber: string,
    /** Le client de la commande : le sujet du témoin au journal. */
    readonly placedByUserId: string,
    /** L'id de la FICHE staff qui a retiré le visa. */
    readonly withdrawnByStaffId: string,
    readonly withdrawnAt: Date,
  ) {}

  durableFact(): DurableFact {
    return {
      type: ORDER_REVIEW_WITHDRAWN,
      key: `${ORDER_REVIEW_WITHDRAWN}:${this.reviewId}`,
      payload: {
        reviewId: this.reviewId,
        orderId: this.orderId,
        orderNumber: this.orderNumber,
        placedByUserId: this.placedByUserId,
        withdrawnByStaffId: this.withdrawnByStaffId,
        withdrawnAt: this.withdrawnAt.toISOString(),
      },
    };
  }

  /** @throws {OrderReviewWithdrawnPayloadError} payload hors forme — faute d'émetteur. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): OrderReviewWithdrawnFact {
    const { reviewId, orderId, orderNumber, placedByUserId, withdrawnByStaffId, withdrawnAt } =
      payload;
    if (
      !isFilled(reviewId) ||
      !isFilled(orderId) ||
      !isFilled(orderNumber) ||
      !isFilled(placedByUserId) ||
      !isFilled(withdrawnByStaffId) ||
      !isFilled(withdrawnAt) ||
      Number.isNaN(Date.parse(withdrawnAt))
    ) {
      throw new OrderReviewWithdrawnPayloadError();
    }
    return new OrderReviewWithdrawnFact(
      reviewId,
      orderId,
      orderNumber,
      placedByUserId,
      withdrawnByStaffId,
      new Date(withdrawnAt),
    );
  }
}

function isFilled(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Un fait « visa retiré » illisible : aucun témoin n'est écrit, le message reste visible. */
export class OrderReviewWithdrawnPayloadError extends TechnicalError {
  constructor() {
    super(
      "order_review_withdrawn.payload_invalid",
      "Le fait « visa de commande retiré » reçu est illisible (visa, commande, client, auteur ou " +
        "instant manquants) : son témoin n'a pas été écrit au journal. Le message reste dans la " +
        "boîte d'envoi ; corriger l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
