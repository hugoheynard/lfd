import type { DurableEvent, DurableFact } from "../../../../platform/outbox/durable-event.js";
import { OrderFulfilledPayloadError } from "../errors/order-fulfilled-payload.error.js";
import type { HandoverVia } from "../services/handover.js";

/** Nom stable du fait, clé de routage vers `@DurableHandler`. */
export const ORDER_FULFILLED = "order.fulfilled";

const VIAS: readonly HandoverVia[] = ["scan", "manual", "deposit"];

/**
 * Fait de domaine : **une commande vient d'être remise**. Écrit par le contexte
 * `orders` dans la transaction qui la passe `fulfilled` ; le contexte ne sait
 * pas qui l'écoute.
 *
 * C'est le fait le plus important du cycle : celui qu'on cherchera le jour où un
 * client dit n'avoir rien reçu. Il porte donc **qui** a remis et **quand** — pas
 * pour qu'un abonné les recalcule, mais pour qu'ils soient figés dans la trace
 * au moment où ils étaient vrais.
 *
 * ## Fait DURABLE depuis le 2026-10-04 (lot E2), sous le type `order.fulfilled`
 *
 * Ses deux abonnés — les points (`credit-points-on-handover`) et le journal
 * (`growth/on-order-handed-over`) — le recevaient en mémoire : un container
 * qui tombait juste après l'écriture de `fulfilled` faisait perdre des points.
 *
 * Pourquoi le commerce écrit le SIEN plutôt que de brancher ses abonnés sur
 * `handover.handed_over` : le retrait ne connaît ni le client ni l'identifiant
 * qu'ils lisent, et surtout il annonce un fait par GESTE (réannonces
 * comprises), là où celui-ci n'est écrit que par l'écriture gagnante de
 * `markFulfilled` — un par commande, d'où la clé `order.fulfilled:<orderId>`.
 * Les deux types sont distincts parce que la classe du retrait porte le même
 * nom (plan `documentation/journalisation/plan-evenements-durables.md`, §3).
 */
export class OrderHandedOverEvent implements DurableEvent {
  constructor(
    readonly orderId: string,
    readonly orderNumber: string,
    /** Le client à qui la commande appartient — le sujet de la trace. */
    readonly placedByUserId: string,
    /** L'id de la fiche staff qui a scanné, figé. */
    readonly handedOverBy: string,
    /** L'instant de la remise, tel que le retrait l'a constaté. */
    readonly handedOverAt: Date,
    /**
     * **Comment** elle a été constatée. Porté par le fait, pas relu ensuite :
     * une remise scannée et une remise saisie n'ont pas la même force, et le
     * journal doit garder laquelle c'était — pas ce que la ligne dira demain.
     */
    readonly via: HandoverVia,
  ) {}

  durableFact(): DurableFact {
    return {
      type: ORDER_FULFILLED,
      key: `${ORDER_FULFILLED}:${this.orderId}`,
      payload: {
        orderId: this.orderId,
        orderNumber: this.orderNumber,
        placedByUserId: this.placedByUserId,
        handedOverBy: this.handedOverBy,
        handedOverAt: this.handedOverAt.toISOString(),
        via: this.via,
      },
    };
  }

  /**
   * Relit le contrat côté abonné.
   *
   * @throws {OrderFulfilledPayloadError} payload hors forme — faute d'émetteur.
   */
  static fromPayload(payload: Readonly<Record<string, unknown>>): OrderHandedOverEvent {
    const { orderId, orderNumber, placedByUserId, handedOverBy, handedOverAt, via } = payload;
    const at = typeof handedOverAt === "string" ? new Date(handedOverAt) : null;
    const knownVia = VIAS.find((candidate) => candidate === via);
    if (
      typeof orderId !== "string" ||
      typeof orderNumber !== "string" ||
      typeof placedByUserId !== "string" ||
      typeof handedOverBy !== "string" ||
      knownVia === undefined ||
      at === null ||
      Number.isNaN(at.getTime())
    ) {
      throw new OrderFulfilledPayloadError();
    }
    return new OrderHandedOverEvent(
      orderId,
      orderNumber,
      placedByUserId,
      handedOverBy,
      at,
      knownVia,
    );
  }
}
