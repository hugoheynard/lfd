/**
 * **Ce qui fige l'unité de vente de chaque déclinaison d'une fiche**
 * (`documentation/pricing/plan-changer-l-unite-de-vente.md`, § 8).
 *
 * L'écran le dit AVANT qu'on essaie ; le serveur tranche quand même au
 * changement. `GET /catalogue/products/:id/sale-unit-usage`.
 */
export interface VariantSaleUnitUsageView {
  readonly variantId: string;
  /**
   * `false` = le commerce n'a pas répondu : on ne sait pas si la déclinaison a
   * servi, et l'écran garde le sélecteur fermé.
   */
  readonly verified: boolean;
  /** Les catégories d'usage, codes stables (`order`, `mercuriale`…). Vide = libre. */
  readonly uses: readonly string[];
  /** Les mêmes, dites en français, dans l'ordre du refus serveur. */
  readonly labels: readonly string[];
}

export interface ProductSaleUnitUsageView {
  readonly variants: readonly VariantSaleUnitUsageView[];
}
