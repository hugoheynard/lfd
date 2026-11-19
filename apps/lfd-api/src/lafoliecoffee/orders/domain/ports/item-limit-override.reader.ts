import type { ItemLimitOverride } from "../services/item-limit-overrides.js";

/**
 * Port de **lecture** des dépassements consignés sur une commande — la vue
 * d'une commande au back-office, sous `lfc_product_limit_override:read`.
 */
export abstract class ItemLimitOverrideReader {
  /** Ceux de cette commande, du plus ancien au plus récent ; vide sans aucun. */
  abstract forOrder(orderId: string): Promise<readonly ItemLimitOverride[]>;
}
