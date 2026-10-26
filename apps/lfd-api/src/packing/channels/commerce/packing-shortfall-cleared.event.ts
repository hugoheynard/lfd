import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import { shipmentRankOf } from "../../../production/channels/packing/index.js";
import { instantOf, textOf } from "../../../production/channels/packing/payload-fields.js";
import { PackingShortfallPayloadError } from "./packing-shortfall-reported.event.js";

/** Nom stable du fait, clé de routage vers `@DurableHandler`. */
export const PACKING_SHORTFALL_CLEARED = "packing.shortfall_cleared";

/**
 * **Le manque est effacé : le bac s'est fermé complet** (lot E6a, plan
 * plan E6 (`documentation/commandes/bon-de-livraison.md`) § 3 — « refermer le bac complet
 * efface le signal »).
 *
 * Un fait à part plutôt qu'un effet de `packing.order_packed` : refermer après
 * « Rouvrir » republie la clé d'origine de celui-ci, que la boîte d'envoi
 * absorbe — un manque signalé entre les deux ne serait jamais effacé. Publié
 * SEULEMENT par une fermeture qui efface un signal (le bac le sait,
 * `packing_order.shortfall_reported_at`), jamais à chaque fermeture.
 *
 * Clé : `packing.shortfall_cleared:<orderId>:<clearedAt>` — inchangée par le
 * reliquat, qui ajoute `rank` à la charge (plan E7 reliquat, choix 15 ; absent
 * = rang 1). Le commerce
 * n'efface que si son signal est antérieur à `clearedAt`.
 */
export class PackingShortfallClearedEvent implements DurableEvent {
  constructor(
    readonly orderId: string,
    /** Le rang de l'envoi dont le manque s'efface — 1 = la commande. */
    readonly rank: number,
    readonly reference: string,
    readonly clearedAt: Date,
  ) {}

  durableFact(): DurableFact {
    return {
      type: PACKING_SHORTFALL_CLEARED,
      key: `${PACKING_SHORTFALL_CLEARED}:${this.orderId}:${this.clearedAt.toISOString()}`,
      payload: {
        orderId: this.orderId,
        rank: this.rank,
        reference: this.reference,
        clearedAt: this.clearedAt.toISOString(),
      },
    };
  }

  /** @throws {PackingShortfallPayloadError} */
  static fromPayload(payload: Readonly<Record<string, unknown>>): PackingShortfallClearedEvent {
    const orderId = textOf(payload["orderId"]);
    const rank = shipmentRankOf(payload["rank"]);
    const reference = textOf(payload["reference"]);
    const clearedAt = instantOf(payload["clearedAt"]);
    if (orderId === null || rank === null || reference === null || clearedAt === null) {
      throw new PackingShortfallPayloadError("effacé");
    }
    return new PackingShortfallClearedEvent(orderId, rank, reference, clearedAt);
  }
}
