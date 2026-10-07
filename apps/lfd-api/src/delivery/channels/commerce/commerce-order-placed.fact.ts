import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";

/** Nom stable du fait, clé de routage vers `@DurableHandler`. */
export const COMMERCE_ORDER_PLACED = "commerce.order_placed";

/**
 * **« Une commande vient d'être passée »** — ce que la livraison DÉCLARE et que
 * le commerce ÉCRIT dans la boîte d'envoi, dans la transaction de la
 * passation (`documentation/livraisons/tournees/composition-automatique.md`,
 * Q4, lot CA0). La livraison situe l'adresse pour que le prévisionnel du jour
 * ait un point.
 *
 * ## Fait DURABLE depuis le 2026-10-07
 *
 * C'était un port appelé par un abonné EN MÉMOIRE à `OrderPlacedEvent` : un
 * redémarrage entre la passation et l'appel laissait l'adresse non située
 * jusqu'à la commande suivante du jour ou à l'arrêt du plan, sans que
 * personne le sache (`lint:durable-cross-block`). La livraison ne peut pas
 * écouter un fait du commerce (`delivery → b2b` est interdit) : le fait vit
 * donc dans SON canal, comme le départ d'une tournée vit dans celui du retrait.
 *
 * Le type n'est pas `order.placed` : ce nom est déjà une valeur du journal
 * croissance, et deux faits homonymes se livreraient l'un pour l'autre.
 *
 * ## Le contrat
 *
 * `{ orderId }`, rien d'autre : le commerce ne trie pas (retrait ou
 * livraison, jour) — la livraison relit la commande par son canal et décide.
 * Clé : `commerce.order_placed:<orderId>`, une commande ne se passe qu'une fois.
 */
export class CommerceOrderPlacedFact implements DurableEvent {
  constructor(readonly orderId: string) {}

  durableFact(): DurableFact {
    return {
      type: COMMERCE_ORDER_PLACED,
      key: `${COMMERCE_ORDER_PLACED}:${this.orderId}`,
      payload: { orderId: this.orderId },
    };
  }

  /** @throws {CommerceOrderPlacedPayloadError} un fait sans identifiant de commande. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): CommerceOrderPlacedFact {
    const orderId = payload["orderId"];
    if (typeof orderId !== "string" || orderId.length === 0) {
      throw new CommerceOrderPlacedPayloadError();
    }
    return new CommerceOrderPlacedFact(orderId);
  }
}

/** Un fait « commande passée » illisible : rien n'est situé, le message reste visible. */
export class CommerceOrderPlacedPayloadError extends TechnicalError {
  constructor() {
    super(
      "commerce_order_placed.payload_invalid",
      "Le fait « commande passée » reçu par la livraison est illisible (commande manquante) : " +
        "son adresse n'a pas été située. Le message reste dans la boîte d'envoi ; corriger " +
        "l'émetteur puis le rejouer depuis la carte de santé. L'arrêt du plan la situera de toute façon.",
    );
  }
}
