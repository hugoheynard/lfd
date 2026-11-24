import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";

/** Noms stables des faits d'une échéance, clés de routage vers `@DurableHandler`. */
export const RECURRING_OCCURRENCE_PLACED = "recurring.occurrence_placed";
export const RECURRING_OCCURRENCE_REFUSED = "recurring.occurrence_refused";
export const RECURRING_OCCURRENCE_MISSED = "recurring.occurrence_missed";

/** L'issue d'une échéance, écrite en durable. */
export type RecurringOccurrenceFactType =
  | typeof RECURRING_OCCURRENCE_PLACED
  | typeof RECURRING_OCCURRENCE_REFUSED
  | typeof RECURRING_OCCURRENCE_MISSED;

/** Ce que l'issue dit de plus que l'échéance : la commande, ou la cause et sa phrase. */
export type RecurringOccurrenceOutcome =
  | { readonly kind: "placed"; readonly orderId: string }
  | { readonly kind: "refused" | "missed"; readonly cause: string; readonly reason: string };

/**
 * **L'issue d'une échéance** — écrite par le balayage dans la transaction où
 * il l'inscrit sur la ligne (plan `plan-bloc-recurrent.md`, § 6.2) :
 *
 * - `recurring.occurrence_placed` : le commerce l'a passée, une fois par
 *   échéance (clé `<type>:<occurrenceId>`) ;
 * - `recurring.occurrence_refused` : seulement quand la cause est NOUVELLE —
 *   le seul moment où l'alerte staff repart (clé `…:<occurrenceId>:<cause>`) ;
 * - `recurring.occurrence_missed` : l'heure limite est passée, une fois.
 *
 * 🔴 Il vit dans le CANAL : un fait qu'un autre bloc consomme fait partie de
 * la surface publiée.
 */
export class RecurringOccurrenceFact implements DurableEvent {
  constructor(
    readonly occurrenceId: string,
    readonly basketId: string,
    readonly buyerUserId: string,
    readonly companyId: string,
    /** Le jour de service visé, `AAAA-MM-JJ`. */
    readonly serviceDay: string,
    readonly outcome: RecurringOccurrenceOutcome,
  ) {}

  get type(): RecurringOccurrenceFactType {
    switch (this.outcome.kind) {
      case "placed":
        return RECURRING_OCCURRENCE_PLACED;
      case "refused":
        return RECURRING_OCCURRENCE_REFUSED;
      case "missed":
        return RECURRING_OCCURRENCE_MISSED;
    }
  }

  durableFact(): DurableFact {
    const outcome = this.outcome;
    const base = {
      occurrenceId: this.occurrenceId,
      basketId: this.basketId,
      buyerUserId: this.buyerUserId,
      companyId: this.companyId,
      serviceDay: this.serviceDay,
    };
    if (outcome.kind === "placed") {
      return {
        type: this.type,
        key: `${this.type}:${this.occurrenceId}`,
        payload: { ...base, orderId: outcome.orderId },
      };
    }
    return {
      type: this.type,
      key:
        outcome.kind === "refused"
          ? `${this.type}:${this.occurrenceId}:${outcome.cause}`
          : `${this.type}:${this.occurrenceId}`,
      payload: { ...base, cause: outcome.cause, reason: outcome.reason },
    };
  }

  /** @throws {RecurringOccurrenceFactPayloadError} une charge hors forme. */
  static fromDelivery(delivery: {
    readonly type: string;
    readonly payload: Readonly<Record<string, unknown>>;
  }): RecurringOccurrenceFact {
    const { occurrenceId, basketId, buyerUserId, companyId, serviceDay } = delivery.payload;
    const outcome = outcomeOf(delivery.type, delivery.payload);
    if (
      outcome === null ||
      !isText(occurrenceId) ||
      !isText(basketId) ||
      !isText(buyerUserId) ||
      !isText(companyId) ||
      !isText(serviceDay)
    ) {
      throw new RecurringOccurrenceFactPayloadError(delivery.type);
    }
    return new RecurringOccurrenceFact(
      occurrenceId,
      basketId,
      buyerUserId,
      companyId,
      serviceDay,
      outcome,
    );
  }
}

function outcomeOf(
  type: string,
  payload: Readonly<Record<string, unknown>>,
): RecurringOccurrenceOutcome | null {
  const { orderId, cause, reason } = payload;
  if (type === RECURRING_OCCURRENCE_PLACED) {
    return isText(orderId) ? { kind: "placed", orderId } : null;
  }
  const kind =
    type === RECURRING_OCCURRENCE_REFUSED
      ? "refused"
      : type === RECURRING_OCCURRENCE_MISSED
        ? "missed"
        : null;
  if (kind === null || !isText(cause) || !isText(reason)) {
    return null;
  }
  return { kind, cause, reason };
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Un fait d'échéance illisible : ses abonnés n'ont rien fait, le message reste visible. */
export class RecurringOccurrenceFactPayloadError extends TechnicalError {
  constructor(type: string) {
    super(
      "recurring.occurrence_fact.payload_invalid",
      `Un fait « ${type} » d'une échéance de panier récurrent est illisible : ses abonnés ne ` +
        "l'ont pas pris en compte. L'issue de l'échéance est bien inscrite. Le message reste " +
        "dans la boîte d'envoi ; corriger l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
