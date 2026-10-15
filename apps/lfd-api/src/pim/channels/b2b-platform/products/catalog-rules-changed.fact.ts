import { syncOrderTimeLimitRuleSchema, type SyncOrderTimeLimitRule } from "@lfd/catalog-sync";
import { z } from "zod";

import type { DurableEvent, DurableFact } from "../../../../platform/outbox/durable-event.js";
import { CatalogFactPayloadError } from "./catalog-category-changed.fact.js";

/** Nom STABLE du fait, clé de routage vers `@DurableHandler`. */
export const PIM_CATALOG_RULES_CHANGED = "pim.catalog_rules_changed";

const payloadSchema = z.object({
  seq: z.number().int().positive(),
  emittedAt: z.string().datetime({ offset: true }),
  orderTimeLimits: z.array(syncOrderTimeLimitRuleSchema),
});

/**
 * **Les règles globales du catalogue ont changé** — fait DURABLE que le
 * référentiel DÉCLARE dans son canal vers la plateforme (lot 2b de
 * `documentation/pim/plan-catalogue-synchronise-par-audience.md`, C3 —
 * remonté du lot 4).
 *
 * Il porte l'ÉCHELLE ENTIÈRE des limites de commande, comme le fil du push
 * depuis sa v7 : ce sont les règles qui traversent, pas leur résolution. La
 * plateforme les descend elle-même sur chaque article (`@lfd/catalog-sync`,
 * la même implémentation que le référentiel). Un ensemble, pas un diff : le
 * plus récent gagne (`seq`), et il se rejoue seul.
 *
 * ⚠️ **Il ne se journalise pas** : le référentiel trace déjà la décision
 * (`order_time_limit.*`).
 *
 * Clé `pim.catalog_rules_changed:<seq>` : un numéro n'est tiré qu'une fois.
 */
export class CatalogRulesChangedFact implements DurableEvent {
  constructor(
    readonly seq: number,
    /** L'instant d'émission, au `Clock` du référentiel — la date de réception côté plateforme. */
    readonly emittedAt: string,
    readonly orderTimeLimits: readonly SyncOrderTimeLimitRule[],
  ) {}

  durableFact(): DurableFact {
    return {
      type: PIM_CATALOG_RULES_CHANGED,
      key: `${PIM_CATALOG_RULES_CHANGED}:${String(this.seq)}`,
      payload: {
        seq: this.seq,
        emittedAt: this.emittedAt,
        orderTimeLimits: [...this.orderTimeLimits],
      },
    };
  }

  /** @throws {CatalogFactPayloadError} payload hors forme — faute d'émetteur. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): CatalogRulesChangedFact {
    const parsed = payloadSchema.safeParse(payload);
    if (!parsed.success) {
      throw new CatalogFactPayloadError(PIM_CATALOG_RULES_CHANGED, parsed.error.message);
    }
    const { seq, emittedAt, orderTimeLimits } = parsed.data;
    return new CatalogRulesChangedFact(seq, emittedAt, orderTimeLimits);
  }
}
