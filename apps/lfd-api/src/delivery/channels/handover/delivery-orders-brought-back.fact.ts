import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import type { ShipmentRef } from "../../../production/channels/delivery/index.js";
import { instantOf, shipmentsOf, textOf } from "./fact-fields.js";

/** Nom stable du fait, clé de routage vers `@DurableHandler`. */
export const DELIVERY_ORDERS_BROUGHT_BACK = "delivery.orders_brought_back";

/**
 * **Des commandes d'une tournée sont rapportées** — la garde rentre au dépôt
 * (`a-la-porte.md`, B3, LB-Q2). Fait DURABLE depuis le 2026-10-06 (plan
 * `documentation/livraisons/livreur/plan-depart-durable.md`, §5, B2).
 *
 * Écrit dans la transaction de la décision « Rapporter », qu'elle vienne du
 * commercial (`BringStopBackHandler`) ou du réglage à la porte
 * (`StopDecisionBySetting`). Il porte son instant : le retrait ordonne départ
 * et retour PAR INSTANT, jamais par ordre d'arrivée — sous reprise, un fait
 * peut arriver des heures après l'autre.
 *
 * Clé : `delivery.orders_brought_back:<roundId>:<envois>`, chaque envoi écrit
 * `<orderId>` au rang 1 et `<orderId>:r<rang>` au-delà (plan E7 reliquat,
 * choix 6) — le rang 1 garde la clé d'avant, et le rapport d'un reliquat dans
 * la même tournée n'est pas avalé. Un arrêt rapporté est clos par sa tournée
 * et ne se rapporte plus : la clé est unique par geste. Un fait écrit avant,
 * avec `orderIds`, se relit au rang 1.
 */
export class DeliveryOrdersBroughtBackFact implements DurableEvent {
  constructor(
    readonly roundId: string,
    readonly shipments: readonly ShipmentRef[],
    /** L'instant de la décision. */
    readonly broughtBackAt: Date,
  ) {}

  durableFact(): DurableFact {
    return {
      type: DELIVERY_ORDERS_BROUGHT_BACK,
      key:
        `${DELIVERY_ORDERS_BROUGHT_BACK}:${this.roundId}:` +
        this.shipments.map((shipment) => `${shipment.orderId}${shipment.keySuffix()}`).join(","),
      payload: {
        roundId: this.roundId,
        shipments: this.shipments.map((shipment) => shipment.toPayload()),
        broughtBackAt: this.broughtBackAt.toISOString(),
      },
    };
  }

  /** @throws {DeliveryOrdersBroughtBackPayloadError} un payload hors contrat. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): DeliveryOrdersBroughtBackFact {
    const roundId = textOf(payload["roundId"]);
    const shipments = shipmentsOf(payload);
    const broughtBackAt = instantOf(payload["broughtBackAt"]);
    if (roundId === null || shipments === null || broughtBackAt === null) {
      throw new DeliveryOrdersBroughtBackPayloadError();
    }
    return new DeliveryOrdersBroughtBackFact(roundId, shipments, broughtBackAt);
  }
}

/** Le fait `delivery.orders_brought_back` reçu ne respecte pas son contrat. */
export class DeliveryOrdersBroughtBackPayloadError extends TechnicalError {
  constructor() {
    super(
      "delivery_orders_brought_back.payload_invalid",
      "Le fait « commandes rapportées » reçu est illisible (tournée, envois ou instant " +
        "manquants) : le retrait les croit encore parties. Le message reste dans la boîte " +
        "d'envoi ; corriger l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
