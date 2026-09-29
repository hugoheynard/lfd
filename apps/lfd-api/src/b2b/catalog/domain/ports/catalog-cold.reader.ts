/**
 * **Les produits froids du miroir** — ceux dont la fiche du référentiel dit
 * « demande le froid » (fil v12, lot 4 bis du plan de préparation de tournée,
 * v2-2).
 *
 * Un port à part plutôt qu'un champ de plus sur `ProductCatalogReader` (ISP) :
 * celui-là est l'autorité de prix du checkout, et le froid n'y sert à rien.
 * Seul le relais vers la livraison le lit.
 */
export abstract class CatalogColdReader {
  /**
   * Les SKU PRODUIT dont un article en rayon demande le froid — le SKU que
   * portent les lignes de commande. Un article retiré n'y figure pas.
   */
  abstract coldProductSkus(): Promise<ReadonlySet<string>>;
}
