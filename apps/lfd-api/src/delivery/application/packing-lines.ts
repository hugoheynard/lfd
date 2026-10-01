import type { DeliveryPackingLineView } from "@lfd/contracts";

import type { DeliveryOrderLine, DeliveryProduct } from "../channels/commerce/index.js";

/**
 * **Les lignes d'une commande, fusionnées par SKU, avec le froid de la fiche
 * produit** — ce que le colisage proposé (lot 4 bis, L4b-C4) et la fiche du
 * livreur (`parcours-du-livreur.md`, PL4) lisent l'un et l'autre. Pure, dans
 * l'ordre de la première apparition ; le nom est celui de la première ligne.
 *
 * Elle ne recopie que le SKU, le nom, la quantité et le froid : rien d'autre
 * n'entre, et le port des lignes ne porte aucun montant.
 */
export function packingLinesOf(
  lines: readonly DeliveryOrderLine[],
  sold: readonly DeliveryProduct[],
): readonly DeliveryPackingLineView[] {
  const cold = new Set(sold.filter((product) => product.requiresCold).map((p) => p.sku));
  const merged = new Map<string, DeliveryPackingLineView>();
  for (const line of lines) {
    const known = merged.get(line.sku);
    merged.set(line.sku, {
      sku: line.sku,
      name: known?.name ?? line.name,
      quantity: (known?.quantity ?? 0) + line.quantity,
      requiresCold: cold.has(line.sku),
    });
  }
  return [...merged.values()];
}
