import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";

/** Nom stable du fait, clé de routage vers `@DurableHandler`. */
export const COMMERCE_ORDER_REVISED = "commerce.order_revised";

/**
 * **« Une commande vient d'être modifiée »** — ce que la livraison DÉCLARE et
 * que le commerce ÉCRIT dans la boîte d'envoi, dans la transaction de la
 * révision (plan `documentation/commandes/plan-modifier-une-commande.md`, M1,
 * §9 : « Livraison »). Même figure que `CommerceOrderPlacedFact` et
 * `CommerceOrderCancelledFact`, et pour la même raison : `delivery → b2b` est
 * interdit, le fait vit donc dans SON canal.
 *
 * `routeChanged` : le mode, la date, le point ou l'adresse ont changé. La
 * livraison sort alors la commande de son transfert prévu, l'y remet si elle
 * y a sa place, et situe la nouvelle adresse — ce que la passation déclenche.
 * Sinon (lignes, note, créneau), rien ne bouge pour elle : la feuille de
 * départ relit la commande à jour.
 *
 * Clé `commerce.order_revised:<orderId>:<révision>` : une révision n'arrive qu'une fois.
 */
export class CommerceOrderRevisedFact implements DurableEvent {
  constructor(
    readonly orderId: string,
    readonly revision: number,
    readonly routeChanged: boolean,
  ) {}

  durableFact(): DurableFact {
    return {
      type: COMMERCE_ORDER_REVISED,
      key: `${COMMERCE_ORDER_REVISED}:${this.orderId}:${String(this.revision)}`,
      payload: { orderId: this.orderId, revision: this.revision, routeChanged: this.routeChanged },
    };
  }

  /** @throws {CommerceOrderRevisedPayloadError} un fait sans commande, révision ou drapeau. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): CommerceOrderRevisedFact {
    const orderId = payload["orderId"];
    const revision = payload["revision"];
    const routeChanged = payload["routeChanged"];
    if (
      typeof orderId !== "string" ||
      orderId.length === 0 ||
      typeof revision !== "number" ||
      !Number.isInteger(revision) ||
      typeof routeChanged !== "boolean"
    ) {
      throw new CommerceOrderRevisedPayloadError();
    }
    return new CommerceOrderRevisedFact(orderId, revision, routeChanged);
  }
}

/** Un fait « commande modifiée » illisible : rien n'est déplacé, le message reste visible. */
export class CommerceOrderRevisedPayloadError extends TechnicalError {
  constructor() {
    super(
      "commerce_order_revised.payload_invalid",
      "Le fait « commande modifiée » reçu par la livraison est illisible (commande, révision ou " +
        "changement d'acheminement manquant) : son transfert et son adresse n'ont pas été repris. " +
        "Le message reste dans la boîte d'envoi ; corriger l'émetteur puis le rejouer depuis la " +
        "carte de santé.",
    );
  }
}
