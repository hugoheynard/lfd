/**
 * Port de **lecture** : parmi ces SKU de vente, ceux réservés à un AUTRE compte
 * que celui-ci — ni à lui, ni à son principal actif
 * (`documentation/catalogue/plan-articles-sur-mesure.md`, Q1). Une méthode
 * (ISP) : la pose d'une mercuriale n'a besoin de rien d'autre.
 */
export abstract class ReservedElsewhereReader {
  abstract among(companyId: string, shopSkus: readonly string[]): Promise<readonly string[]>;
}
