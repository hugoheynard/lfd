import type { OrderLineInput } from "@lfd/contracts";

/**
 * Le nombre d'articles d'un brouillon, par la règle du panier de la saisie
 * (`CartStore.itemCount`) : une ligne à la pièce compte sa quantité, une ligne
 * au poids compte pour un article — ses grammes ne sont pas des articles.
 */
export function draftItemCount(lines: readonly OrderLineInput[]): number {
  return lines.reduce((total, line) => total + (line.saleUnit === "weight" ? 1 : line.quantity), 0);
}
