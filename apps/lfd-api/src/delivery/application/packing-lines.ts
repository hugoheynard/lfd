import type { DeliveryPackingLineView } from "@lfd/contracts";

import type { DeliveryOrderLine } from "../channels/commerce/index.js";

/**
 * **Les lignes d'une commande, fusionnées par SKU, avec le froid de la fiche
 * produit** — ce que le colisage proposé (lot 4 bis, L4b-C4) et la fiche du
 * livreur (`parcours-du-livreur.md`, PL4) lisent l'un et l'autre. Pure, dans
 * l'ordre de la première apparition ; le nom est celui de la première ligne.
 *
 * Le froid se lit par SKU de VENTE (`DeliveryColdSkusReader`) : comparé au
 * catalogue pro par défaut, une ligne vendue sous une déclinaison partait sèche
 * (L0 du plan pro-voit-les-déclinaisons, 2026-10-29).
 *
 * Elle ne recopie que le SKU, le nom, la quantité et le froid : rien d'autre
 * n'entre, et le port des lignes ne porte aucun montant.
 */
export function packingLinesOf(
  lines: readonly DeliveryOrderLine[],
  coldSkus: ReadonlySet<string>,
): readonly DeliveryPackingLineView[] {
  const merged = new Map<string, DeliveryPackingLineView>();
  for (const line of lines) {
    const known = merged.get(line.sku);
    merged.set(line.sku, {
      sku: line.sku,
      name: known?.name ?? line.name,
      // Un article n'a qu'une unité (figée à la publication) : ses grammes
      // s'additionnent entre eux (P6 de `pricing/vente-au-poids.md`).
      quantity: (known?.quantity ?? 0) + line.quantity,
      saleUnit: line.saleUnit,
      requiresCold: coldSkus.has(line.sku),
    });
  }
  return [...merged.values()];
}
