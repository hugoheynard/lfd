/**
 * **Le produit et la famille d'un article**, tels que le catalogue servi les
 * range au moment où on le lit.
 *
 * `categoryPath` : la famille puis ses parentes, la plus proche en tête — la
 * lignée qu'une règle de remise sur une famille vise.
 */
export interface OrderLineClassification {
  readonly productId: string;
  readonly categoryId: string;
  readonly categoryPath: readonly string[];
  /**
   * Le marqueur « sur mesure » de l'article au moment de la lecture (plan
   * `documentation/catalogue/plan-sur-mesure-partout.md`, M1) — la passation
   * le scelle sur la ligne, et plus personne ne le relit ensuite.
   */
  readonly madeToOrder: boolean;
}

/**
 * **Où un SKU est rangé** — déclaré par la commande, implémenté par le
 * catalogue sur ses articles (V4 de l'ancien plan des exclusions, cf. `documentation/promotions/promotions.md`, § 2.17).
 *
 * Lu à la passation pour figer produit et famille sur la ligne et décider
 * son éligibilité à la remise de retrait, et son marqueur « sur mesure » ; lu au devis seulement quand la
 * remise a des règles. Un port étroit (ISP) : ni prix, ni nom — l'autorité de
 * prix reste `ProductCatalogReader`.
 */
export abstract class OrderLineClassificationReader {
  /**
   * Les SKU de commande (le SKU du PRODUIT, celui que la boutique vend) →
   * leur rangement. Un SKU que le catalogue ne connaît pas est **absent** de
   * la table rendue : la remise le juge alors par son seul mode.
   */
  abstract classify(skus: readonly string[]): Promise<ReadonlyMap<string, OrderLineClassification>>;
}
