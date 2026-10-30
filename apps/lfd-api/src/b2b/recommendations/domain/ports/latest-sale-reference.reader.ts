/**
 * Port de **lecture** de la lignée de détachement, déclaré par la
 * recommandation (`plan-pro-voit-les-declinaisons.md`, L7d-bis) : « vos
 * habituels » regroupe l'ancienne et la nouvelle référence d'une déclinaison
 * détachée sous la plus récente. Implémenté sur le catalogue, comme
 * `AudienceSkuReader`.
 */
export abstract class LatestSaleReferenceReader {
  /** La référence la plus récente de chaque SKU qui en a une ; les autres n'y sont pas. */
  abstract latestOf(skus: readonly string[]): Promise<ReadonlyMap<string, string>>;
}
