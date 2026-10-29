/**
 * **Parmi ces SKU de vente, lesquels désignent un article RETIRÉ ?**
 * (`plan-pro-voit-les-declinaisons.md`, L5, 2026-10-29).
 *
 * Un port à part plutôt qu'une méthode de plus sur `CatalogReader` (ISP) :
 * celui-là répond « qu'est-ce qui se vend », et un article retiré, par
 * construction, n'y paraît jamais. Seuls les éditeurs de décisions tarifaires
 * posent cette question-ci — pour dire au staff « cet article a été retiré »
 * plutôt que « cette référence n'existe pas », deux refus dont le geste de
 * sortie diffère.
 */
export abstract class WithdrawnShopSkusReader {
  /**
   * Les SKU demandés qu'un article retiré (`withdrawn_at` posé) porte comme
   * SKU de vente (`shopSkuOf`). Un SKU inconnu, ou encore en vente, n'y est pas.
   */
  abstract withdrawnAmong(shopSkus: readonly string[]): Promise<ReadonlySet<string>>;
}
