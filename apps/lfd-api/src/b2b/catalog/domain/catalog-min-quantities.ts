/**
 * **La quantité minimale d'achat d'un article**, telle que le référentiel la
 * publie (fil v15, `documentation/catalogue/plan-quantite-minimale.md`) : en
 * pièces, un minimum par clientèle — sans contexte de vente (Q2, Hugo,
 * 2026-10-29). EFFECTIVE — l'héritage du défaut est déjà résolu là-bas, et un
 * article au poids n'en porte jamais. `null` = aucun minimum, y compris pour
 * un article reçu avant le fil v15.
 *
 * Dans son fichier pour que le port de lecture et l'entité la partagent sans
 * s'importer l'un l'autre, comme `CatalogSaleUnit`.
 */
export interface CatalogMinQuantities {
  readonly pro: number | null;
  readonly public: number | null;
}

/** Ce que porte un article reçu avant le fil v15, ou sans minimum. */
export const NO_CATALOG_MIN_QUANTITIES: CatalogMinQuantities = { pro: null, public: null };

/** **Le minimum de qui regarde** — celui de sa clientèle. `null` = aucun minimum. */
export function minQuantityFor(
  minimums: CatalogMinQuantities,
  audience: keyof CatalogMinQuantities,
): number | null {
  return minimums[audience];
}
