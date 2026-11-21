import type { DurableEvent, DurableFact } from "../../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/** Nom STABLE du fait, clé de routage vers `@DurableHandler`. */
export const ORDER_REVIEWED = "order.reviewed";

/**
 * **« Un commercial a visé la commande »** — fait DURABLE, écrit par
 * `ReviewOrderHandler` dans l'unité de travail qui insère le visa. Abonnés :
 * les alertes de compte, qui acquittent celles de la commande au nom de qui
 * l'a visée, et le journal (`order.reviewed`). Clé `…:<reviewId>` : chaque visa est un geste.
 */
export class OrderReviewedFact implements DurableEvent {
  constructor(
    readonly reviewId: string,
    readonly orderId: string,
    readonly orderNumber: string,
    /** Le client de la commande : le sujet du témoin au journal. */
    readonly placedByUserId: string,
    readonly reviewedRevision: number,
    /** L'id de la FICHE staff qui a visé. */
    readonly reviewedByStaffId: string,
    readonly reviewedAt: Date,
  ) {}

  durableFact(): DurableFact {
    return {
      type: ORDER_REVIEWED,
      key: `${ORDER_REVIEWED}:${this.reviewId}`,
      payload: {
        reviewId: this.reviewId,
        orderId: this.orderId,
        orderNumber: this.orderNumber,
        placedByUserId: this.placedByUserId,
        reviewedRevision: this.reviewedRevision,
        reviewedByStaffId: this.reviewedByStaffId,
        reviewedAt: this.reviewedAt.toISOString(),
      },
    };
  }

  /** @throws {OrderReviewedPayloadError} payload hors forme — faute d'émetteur. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): OrderReviewedFact {
    const {
      reviewId,
      orderId,
      orderNumber,
      placedByUserId,
      reviewedRevision,
      reviewedByStaffId,
      reviewedAt,
    } = payload;
    if (
      !isFilled(reviewId) ||
      !isFilled(orderId) ||
      !isFilled(orderNumber) ||
      !isFilled(placedByUserId) ||
      typeof reviewedRevision !== "number" ||
      !Number.isInteger(reviewedRevision) ||
      !isFilled(reviewedByStaffId) ||
      !isFilled(reviewedAt) ||
      Number.isNaN(Date.parse(reviewedAt))
    ) {
      throw new OrderReviewedPayloadError();
    }
    return new OrderReviewedFact(
      reviewId,
      orderId,
      orderNumber,
      placedByUserId,
      reviewedRevision,
      reviewedByStaffId,
      new Date(reviewedAt),
    );
  }
}

function isFilled(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Un fait « commande visée » illisible : rien n'est acquitté, le message reste visible. */
export class OrderReviewedPayloadError extends TechnicalError {
  constructor() {
    super(
      "order_reviewed.payload_invalid",
      "Le fait « commande visée » reçu est illisible (visa, commande, auteur ou instant " +
        "manquants) : les alertes de la commande n'ont pas été acquittées. Le message reste dans " +
        "la boîte d'envoi ; corriger l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
