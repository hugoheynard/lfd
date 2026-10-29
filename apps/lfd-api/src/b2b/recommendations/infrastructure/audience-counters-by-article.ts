import type { ProductAudienceCounterView } from "@lfd/contracts";

import type { SaleSkuAliases } from "../../catalog/domain/sale-sku-aliases.js";

/**
 * Additionne les compteurs qu'une ancienne référence et sa cible portent sous
 * la même clé (jour, événement, emplacement, source), rendus sous la cible.
 * L'ordre d'arrivée est gardé : la première occurrence d'une clé fixe sa place.
 */
export function foldCountersByArticle(
  views: readonly ProductAudienceCounterView[],
  aliases: SaleSkuAliases,
): readonly ProductAudienceCounterView[] {
  const folded = new Map<string, ProductAudienceCounterView>();
  for (const view of views) {
    const sku = aliases.canonical(view.sku);
    const key = [view.day, sku, view.event, view.placement, view.source].join("\u0000");
    const known = folded.get(key);
    folded.set(key, { ...view, sku, count: (known?.count ?? 0) + view.count });
  }
  return [...folded.values()];
}
