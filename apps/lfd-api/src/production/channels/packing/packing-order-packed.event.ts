import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";

/** Nom stable du fait, clé de routage vers `@DurableHandler`. */
export const PACKING_ORDER_PACKED = "packing.order_packed";

/**
 * **Le bac d'une commande est fait — au colisage** (plan
 * `documentation/colisage/plan-domaine-colisage.md`, §12.1, K2).
 *
 * Remplace `production.order_packed` pour une journée `packing` : l'émetteur
 * change, la charge reste la même (`{ orderId, reference, packedAt, packedBy }`),
 * si bien que le commerce la relit par `OrderPackedEvent.fromPayload`. Il
 * écoute les DEUX types pendant un déploiement (§11) ; l'ancien se retire en K3.
 *
 * La clé suit la règle de l'ancien fait : `packing.order_packed:<orderId>`, et
 * un rescan d'un bac déjà fait publie un fait NEUF (`…:reannounced:<instant>`).
 *
 * Déclaré par le fournil dans son canal (§12.1) — le colisage le publie, le
 * commerce le lit par `production/channels/commerce/`.
 */
export class PackingOrderPackedEvent implements DurableEvent {
  constructor(
    readonly orderId: string,
    readonly reference: string,
    /** L'instant de la fermeture d'ORIGINE, jamais celui d'un rescan. */
    readonly packedAt: Date,
    /** La fiche staff qui a fermé. */
    readonly packedBy: string,
    /** Présent sur un rescan : l'instant du geste, pour la clé seulement. */
    readonly reannouncedAt: Date | null = null,
  ) {}

  durableFact(): DurableFact {
    const base = `${PACKING_ORDER_PACKED}:${this.orderId}`;
    return {
      type: PACKING_ORDER_PACKED,
      key:
        this.reannouncedAt === null
          ? base
          : `${base}:reannounced:${this.reannouncedAt.toISOString()}`,
      payload: {
        orderId: this.orderId,
        reference: this.reference,
        packedAt: this.packedAt.toISOString(),
        packedBy: this.packedBy,
      },
    };
  }
}
