/**
 * **Les articles froids du miroir** — ceux dont la fiche du référentiel dit
 * « demande le froid » (fil v12, lot 4 bis du plan de préparation de tournée,
 * v2-2).
 *
 * Un port à part plutôt qu'un champ de plus sur `ProductCatalogReader` (ISP) :
 * celui-là est l'autorité de prix du checkout, et le froid n'y sert à rien.
 * Seuls les relais vers la livraison le lisent.
 */
export abstract class CatalogColdReader {
  /**
   * Les SKU de VENTE (`shopSkuOf`) dont un article en rayon demande le froid,
   * TOUTES audiences — le SKU que portent les lignes de commande, déclinaisons
   * comprises. Un article retiré n'y figure pas.
   *
   * 🔴 Rendait des SKU PRODUIT jusqu'au 2026-10-29 : une ligne vendue sous une
   * déclinaison non défaut partait sèche en tournée (L0 de
   * `catalogue/plan-pro-voit-les-declinaisons.md`).
   */
  abstract coldShopSkus(): Promise<ReadonlySet<string>>;
}
