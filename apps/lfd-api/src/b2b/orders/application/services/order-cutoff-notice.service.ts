import { Injectable } from "@nestjs/common";
import type { OrderQuoteCutoffView } from "@lfd/contracts";

import { Clock } from "../../../../platform/time/clock.js";
import { ProductCatalogReader } from "../../../catalog/domain/ports/product-catalog.reader.js";
import { OrderCutoffReader } from "../../domain/ports/order-cutoff.reader.js";
import { decideStrictestOrderCutoff } from "../../domain/services/order-cutoff-guard.js";

/**
 * **Ce que l'heure limite dira de ce panier pour ce jour**, sans rien refuser.
 *
 * Le devis répondait sans regarder l'heure : un panier chiffré pouvait être
 * refusé à la passation (point 8 de `limites-de-commande/schema-des-reglages.md`,
 * 2026-10-21). Ce service lit les MÊMES sources que la garde de passation
 * (`OrderDrafting.ensureNotTooLate` : règles en vigueur, limite de chaque
 * article, audience `pro`) et décide par la MÊME fonction
 * (`decideStrictestOrderCutoff`). Il ne consulte pas les dérogations : il dit
 * l'état de la journée, pas si ce client passerait pendant le rattrapage.
 */
@Injectable()
export class OrderCutoffNotice {
  constructor(
    private readonly cutoffs: OrderCutoffReader,
    private readonly catalog: ProductCatalogReader,
    private readonly clock: Clock,
  ) {}

  async forDay(skus: readonly string[], fulfillmentDate: string): Promise<OrderQuoteCutoffView> {
    const [fallback, items] = await Promise.all([
      this.cutoffs.list(),
      this.catalog.resolveMany(skus, "pro"),
    ]);
    const decision = decideStrictestOrderCutoff({
      lines: skus.map((sku) => ({ sku, limit: items.get(sku)?.orderTimeLimit ?? null })),
      fallback,
      fulfillmentDate,
      now: this.clock.now(),
    });
    switch (decision.status) {
      case "open":
        return { status: "open", until: decision.limit?.toISOString() ?? null };
      case "grace":
        return { status: "grace", until: decision.graceEnd?.toISOString() ?? null };
      case "closed":
        return { status: "closed", until: null };
    }
  }
}
