import { PUBLIC_SALES_CONTEXT } from "./public-context.js";

/**
 * **La quantité minimale d'achat d'un article**, telle que le référentiel la
 * publie (fil v15, `documentation/catalogue/plan-quantite-minimale.md`) : en
 * pièces, une ligne par clientèle, une case par clé de contexte de vente.
 * EFFECTIVE — l'héritage du défaut est déjà résolu là-bas, et un article au
 * poids n'en porte jamais. Case absente = aucun minimum.
 *
 * Dans son fichier pour que le port de lecture et l'entité la partagent sans
 * s'importer l'un l'autre, comme `CatalogSaleUnit`.
 */
export interface CatalogMinQuantities {
  readonly pro: Readonly<Record<string, number>>;
  readonly public: Readonly<Record<string, number>>;
}

/**
 * Le contexte dans lequel une clientèle commande en ligne (Q7 du plan) : le
 * public dans {@link PUBLIC_SALES_CONTEXT}, le pro dans `b2b`. Une valeur de
 * donnée — la clé que le référentiel range — et non un nom de code.
 */
const ONLINE_CONTEXT: Readonly<Record<keyof CatalogMinQuantities, string>> = {
  public: PUBLIC_SALES_CONTEXT,
  pro: "b2b",
};

/**
 * **Le minimum de qui regarde** — sa clientèle, dans le contexte où elle
 * commande en ligne. `null` = aucun minimum, ou un article reçu avant le fil
 * v15 (`matrix` à `null`) : on ne sait pas, et l'on n'en invente pas.
 */
export function minQuantityFor(
  matrix: CatalogMinQuantities | null,
  audience: keyof CatalogMinQuantities,
): number | null {
  return matrix?.[audience][ONLINE_CONTEXT[audience]] ?? null;
}
