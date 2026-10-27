/**
 * **Ce que la composition de chaque fiche cite comme allergènes** — l'union
 * des codes portés par ses ingrédients cités, dédupliquée et rangée.
 *
 * Déclaré par le catalogue, qui en a besoin pour son jugement unique
 * (`productCompliance`), et implémenté par la provenance (`ingredients/`), qui
 * possède les citations : le catalogue ne lit pas ses tables. Une lecture par
 * LOT — la liste couvre tout le catalogue. Une fiche qui ne cite rien est
 * absente de la table (lire : `[]`).
 */
export abstract class CitedAllergensReader {
  abstract ofProducts(
    productIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly string[]>>;
}
