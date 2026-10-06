import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { instantOf, textOf, textsOf } from "./fact-fields.js";

/** Nom stable du fait, clé de routage vers `@DurableHandler`. */
export const DELIVERY_ORDERS_BROUGHT_BACK = "delivery.orders_brought_back";

/**
 * **Des commandes d'une tournée sont rapportées** — la garde rentre au dépôt
 * (`a-la-porte.md`, B3, LB-Q2). Fait DURABLE depuis le 2026-10-06 (plan
 * `documentation/livraisons/plan-depart-durable.md`, §5, B2).
 *
 * Écrit dans la transaction de la décision « Rapporter », qu'elle vienne du
 * commercial (`BringStopBackHandler`) ou du réglage à la porte
 * (`StopDecisionBySetting`). Il porte son instant : le retrait ordonne départ
 * et retour PAR INSTANT, jamais par ordre d'arrivée — sous reprise, un fait
 * peut arriver des heures après l'autre.
 *
 * Clé : `delivery.orders_brought_back:<roundId>:<orderIds>`. Un arrêt
 * rapporté est clos par sa tournée et ne se rapporte plus : la clé est unique
 * par geste.
 */
export class DeliveryOrdersBroughtBackFact implements DurableEvent {
  constructor(
    readonly roundId: string,
    readonly orderIds: readonly string[],
    /** L'instant de la décision. */
    readonly broughtBackAt: Date,
  ) {}

  durableFact(): DurableFact {
    return {
      type: DELIVERY_ORDERS_BROUGHT_BACK,
      key: `${DELIVERY_ORDERS_BROUGHT_BACK}:${this.roundId}:${this.orderIds.join(",")}`,
      payload: {
        roundId: this.roundId,
        orderIds: [...this.orderIds],
        broughtBackAt: this.broughtBackAt.toISOString(),
      },
    };
  }

  /** @throws {DeliveryOrdersBroughtBackPayloadError} un payload hors contrat. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): DeliveryOrdersBroughtBackFact {
    const roundId = textOf(payload["roundId"]);
    const orderIds = textsOf(payload["orderIds"]);
    const broughtBackAt = instantOf(payload["broughtBackAt"]);
    if (roundId === null || orderIds === null || broughtBackAt === null) {
      throw new DeliveryOrdersBroughtBackPayloadError();
    }
    return new DeliveryOrdersBroughtBackFact(roundId, orderIds, broughtBackAt);
  }
}

/** Le fait `delivery.orders_brought_back` reçu ne respecte pas son contrat. */
export class DeliveryOrdersBroughtBackPayloadError extends TechnicalError {
  constructor() {
    super(
      "delivery_orders_brought_back.payload_invalid",
      "Le fait « commandes rapportées » reçu est illisible (tournée, commandes ou instant " +
        "manquants) : le retrait les croit encore parties. Le message reste dans la boîte " +
        "d'envoi ; corriger l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
