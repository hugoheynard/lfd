import type { SaleUnit } from "./resupply-sale-unit.js";

/** Ce que les commandes sur stock ont pris d'un article, au point, ce jour-là, dans une unité. */
export interface ShelfDraw {
  readonly sku: string;
  /** Le libellé figé sur la ligne de commande — pour nommer un article jamais reçu. */
  readonly label: string;
  /** L'unité figée sur la ligne de commande (`order_lines.sale_unit`). */
  readonly saleUnit: SaleUnit;
  /** Des pièces, ou des GRAMMES si `saleUnit = weight` (L2b-1). */
  readonly quantity: number;
}

/**
 * Port de **lecture** des prélèvements de la vitrine (L2 —
 * `documentation/limites-de-commande/jour-meme-sur-stock.md`) : déclaré par le réassort, qui possède le stock, et implémenté par
 * les commandes, qui possèdent les lignes (`lint:prisma-model-ownership`).
 *
 * Compte les lignes des commandes `supply = shelf` du jour au point, statut ni
 * `draft` ni `cancelled` : une commande au paiement refusé ou en cours prend
 * sa part jusqu'à son annulation. Les lignes au poids y sont depuis le lot
 * L2b-1, en grammes : un article au poids a un stock au poids.
 */
export abstract class ShelfDrawsReader {
  /** Un total par (article, unité), dans l'ordre de première apparition. */
  abstract drawsAt(serviceDay: string, siteId: string): Promise<readonly ShelfDraw[]>;
}
