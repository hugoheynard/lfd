/**
 * Les deux prix au kilo SAISIS d'un article, chacun dans l'unité du prix
 * qu'il accompagne. `null` = non saisi.
 */
export interface CatalogPricePerKg {
  /** Pro HORS TAXE, en millicentimes. */
  readonly proPricePerKgMillicents: number | null;
  /** Public TTC, en centimes. */
  readonly publicPricePerKgTtcCents: number | null;
}

/**
 * Port de **lecture** des prix au kilo, vu par la vitrine
 * (`documentation/pricing/plan-prix-au-kilo.md`, K3).
 *
 * 🔴 **À part de `CatalogReader`, et c'est la promesse « informative » tenue
 * par construction** : `ResolvedCatalogItem` nourrit la résolution du prix, la
 * vente et le réassort. Un prix au kilo qui y entrerait serait à un pas d'être
 * appliqué. Ici, il ne peut qu'être lu et posé sur la vue du rayon.
 */
export abstract class CatalogPricePerKgReader {
  /** Par SKU de DÉCLINAISON ; un SKU inconnu est simplement absent de la carte. */
  abstract bySkus(skus: readonly string[]): Promise<ReadonlyMap<string, CatalogPricePerKg>>;
}
