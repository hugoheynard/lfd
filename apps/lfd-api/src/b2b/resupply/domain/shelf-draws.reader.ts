/** Ce que les commandes sur stock ont pris d'un article, au point, ce jour-là. */
export interface ShelfDraw {
  readonly sku: string;
  /** Le libellé figé sur la ligne de commande — pour nommer un article jamais reçu. */
  readonly label: string;
  /** En PIÈCES : le réassort ne compte que des pièces. */
  readonly quantity: number;
}

/**
 * Port de **lecture** des prélèvements de la vitrine (plan du jour J, §11.2,
 * lot L2) : déclaré par le réassort, qui possède le stock, et implémenté par
 * les commandes, qui possèdent les lignes (`lint:prisma-model-ownership`).
 *
 * Compte les lignes des commandes `supply = shelf` du jour au point, statut ni
 * `draft` ni `cancelled` : une commande au paiement refusé ou en cours prend
 * sa part jusqu'à son annulation. Une ligne vendue au poids n'y est pas — ses
 * quantités sont des grammes, et un article au poids ne se réassortit pas
 * (`resuppliable`) : il n'a pas de stock à décompter.
 */
export abstract class ShelfDrawsReader {
  /** Un total par article, dans l'ordre de première apparition. */
  abstract drawsAt(serviceDay: string, siteId: string): Promise<readonly ShelfDraw[]>;
}
