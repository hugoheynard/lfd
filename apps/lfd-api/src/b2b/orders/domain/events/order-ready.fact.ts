import type { DurableEvent, DurableFact } from "../../../../platform/outbox/durable-event.js";
import { OrderReadyPayloadError } from "../errors/order-ready-payload.error.js";
import {
  shipmentKeySuffix,
  shipmentRankOf,
} from "../../../../production/channels/commerce/index.js";

/** Nom STABLE du fait, clé de routage vers `@DurableHandler`. */
export const ORDER_READY = "order.ready";

/**
 * **Une commande vient d'être déclarée prête** — fait DURABLE, écrit par
 * `MarkOrderReadyHandler` dans l'unité de travail qui gagne `markReady`
 * (lot E5, 2026-10-10, `documentation/journalisation/plan-evenements-durables.md`).
 *
 * Il double `OrderReadyEvent`, qui reste EN MÉMOIRE pour la croissance et le
 * journal (E6) : seul le courriel « prête » l'écoute. Un redémarrage entre la
 * validation et le saut en mémoire perdait ce courriel — le seul qui part au
 * moment où le client doit se déplacer.
 *
 * `{ orderId, rank }`, rien d'autre : l'abonné relit la commande pour composer
 * le message. Clé `order.ready:<orderId>` : un envoi n'est prêt qu'une fois
 * (l'écriture est conditionnée, le perdant n'écrit rien) ; un reliquat a la
 * sienne, `…:<orderId>:r<rang>` (plan E7 reliquat, choix 6 et 17). Un fait
 * écrit avant `rank` se relit au rang 1.
 */
export class OrderReadyFact implements DurableEvent {
  constructor(
    readonly orderId: string,
    /** Le rang de l'envoi prêt — 1 = la commande. */
    readonly rank: number,
  ) {}

  durableFact(): DurableFact {
    return {
      type: ORDER_READY,
      key: `${ORDER_READY}:${this.orderId}${shipmentKeySuffix(this.rank)}`,
      payload: { orderId: this.orderId, rank: this.rank },
    };
  }

  /** @throws {OrderReadyPayloadError} payload hors forme — faute d'émetteur. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): OrderReadyFact {
    const orderId = payload["orderId"];
    const rank = shipmentRankOf(payload["rank"]);
    if (typeof orderId !== "string" || orderId.length === 0 || rank === null) {
      throw new OrderReadyPayloadError();
    }
    return new OrderReadyFact(orderId, rank);
  }
}
