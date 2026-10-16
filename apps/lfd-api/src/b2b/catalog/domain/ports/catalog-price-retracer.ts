/**
 * Port d'**écriture** de l'historique des prix : retracer le prix du
 * référentiel (lot D de
 * `documentation/catalogue/plan-catalogue-synchronise-par-audience.md`, correction
 * BLOQUANT de `vitruve`, 2026-10-15).
 *
 * Le tarificateur lit les prix passés dans `catalog_price_history`
 * (`pricingAt`), dont la dernière ligne d'un article était peut-être un prix
 * **décidé** sur la plateforme. Ces décisions ne sont plus lues : sans ligne
 * neuve, une lecture datée rendrait l'ancien prix décidé indéfiniment pour un
 * article que rien ne touche.
 *
 * Pas d'agrégat : aucune règle ne peut refuser cette écriture. C'est une
 * projection — la trace rattrape le miroir —, par la même règle que les
 * autres écrivains de l'historique (`priceTraceRows`).
 */
export abstract class CatalogPriceRetracer {
  /**
   * Écrit une ligne d'historique pour chaque article **encore vendu** dont le
   * dernier couple prix + taux tracé diffère de celui du référentiel, et rien
   * d'autre. Idempotent : un second appel n'écrit rien.
   *
   * @returns les SKU retracés, dans l'ordre des SKU — vide si rien n'a bougé.
   */
  abstract retrace(at: Date): Promise<readonly string[]>;
}
