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
}

/**
 * **Où un SKU est rangé** — déclaré par la commande, implémenté par le
 * catalogue sur ses articles (V4 du plan
 * `documentation/livraisons/clientele/plan-remise-retrait-par-clientele-et-exclusions.md`).
 *
 * Lu à la passation pour figer produit et famille sur la ligne et décider
 * son éligibilité à la remise de retrait ; lu au devis seulement quand la
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
