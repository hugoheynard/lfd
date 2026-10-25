import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
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
 * Clé : `packing.shortfall_cleared:<orderId>:<clearedAt>`. Le commerce
 * n'efface que si son signal est antérieur à `clearedAt`.
 */
export class PackingShortfallClearedEvent implements DurableEvent {
  constructor(
    readonly orderId: string,
    readonly reference: string,
    readonly clearedAt: Date,
  ) {}

  durableFact(): DurableFact {
    return {
      type: PACKING_SHORTFALL_CLEARED,
      key: `${PACKING_SHORTFALL_CLEARED}:${this.orderId}:${this.clearedAt.toISOString()}`,
      payload: {
        orderId: this.orderId,
        reference: this.reference,
        clearedAt: this.clearedAt.toISOString(),
      },
    };
  }

  /** @throws {PackingShortfallPayloadError} */
  static fromPayload(payload: Readonly<Record<string, unknown>>): PackingShortfallClearedEvent {
    const orderId = textOf(payload["orderId"]);
    const reference = textOf(payload["reference"]);
    const clearedAt = instantOf(payload["clearedAt"]);
    if (orderId === null || reference === null || clearedAt === null) {
      throw new PackingShortfallPayloadError("effacé");
    }
    return new PackingShortfallClearedEvent(orderId, reference, clearedAt);
  }
}
