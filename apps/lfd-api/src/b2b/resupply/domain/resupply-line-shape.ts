import type { SaleUnit } from "./resupply-sale-unit.js";

/**
 * **Une ligne de réassort, telle qu'elle circule** : un article, son libellé
 * figé, une quantité et son unité (des grammes au poids, L2b-1). La forme
 * qu'une demande donne à son reçu et que le reçu attend ; chaque agrégat la
 * revalide dans sa propre factory.
 */
export interface ResupplyLineShape {
  readonly sku: string;
  readonly label: string;
  readonly quantity: number;
  readonly saleUnit: SaleUnit;
}
