import type { SaleUnit } from "@lfd/money";

/**
 * Le mot d'une quantité entière dans un refus de la réserve : des pièces, ou
 * des grammes pour un article au poids (lot L2b-4 de
 * `limites-de-commande/jour-meme-sur-stock.md`).
 */
export function unitWord(unit: SaleUnit): string {
  return unit === "weight" ? "grammes" : "pièces";
}
