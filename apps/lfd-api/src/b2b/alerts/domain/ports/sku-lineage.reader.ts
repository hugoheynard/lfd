/**
 * Port de **lecture** de la lignée de détachement, déclaré par les alertes
 * (`plan-pro-voit-les-declinaisons.md`, L7d-bis) : une déclinaison détachée
 * change de référence, pas d'habitude. Sans ses ancêtres, sa première commande
 * sous la nouvelle référence crierait « jamais commandé ». Implémenté sur le
 * catalogue, comme `LatestSaleReferenceReader` côté recommandation.
 */
export abstract class SkuLineageReader {
  /** Les anciennes références de chaque SKU qui en a, de la plus proche à la plus lointaine. */
  abstract ancestorsOf(skus: readonly string[]): Promise<ReadonlyMap<string, readonly string[]>>;
}
