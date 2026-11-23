/**
 * **Où se rangent un produit et une famille** — ce que les limites de commande
 * demandent au catalogue pour garder une limite de famille honnête :
 *
 * - exclure d'une limite de famille un produit qui n'est pas dans sa
 *   descendance est refusé (l'exclusion ne dirait rien) ;
 * - poser une limite sur une famille qui n'existe pas est refusé (`scope_id`
 *   n'a pas de clé étrangère).
 *
 * Déclaré ici et implémenté par la racine sur les lectures que le catalogue
 * publie : les familles et les fiches appartiennent au catalogue, que les
 * limites ne lisent pas.
 */
export abstract class ProductLineageReader {
  /**
   * Les familles du produit, **la plus proche d'abord**, jusqu'à la racine.
   * `null` : aucune fiche sous cet identifiant.
   */
  abstract lineageOf(productId: string): Promise<readonly string[] | null>;

  /** La famille existe, archivée ou non. */
  abstract familyExists(categoryId: string): Promise<boolean>;
}
