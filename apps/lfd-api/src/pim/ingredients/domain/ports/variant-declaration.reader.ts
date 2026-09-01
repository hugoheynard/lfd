/** Ce qu'une déclinaison DÉCLARE en allergènes — le strict nécessaire pour comparer. */
export interface VariantDeclaredAllergens {
  readonly variantId: string;
  /**
   * `null` = **aucune fiche réglementaire**, à ne pas confondre avec `[]`, qui
   * est l'affirmation « aucun allergène ». Les deux états doivent survivre
   * jusqu'à l'écran : sans fiche, il n'y a rien à reprendre (D5).
   */
  readonly allergens: readonly string[] | null;
}

/**
 * **Ce que les déclinaisons d'un produit déclarent** — vu depuis la provenance.
 *
 * Un port de lecture à une seule méthode, déclaré par son consommateur : la
 * comparaison entre l'ensemble dérivé de la composition et la déclaration a
 * besoin des codes déclarés, et de rien d'autre. Dépendre de `CatalogueReader`
 * — taux de TVA, canaux effectifs, couche éditoriale — aurait fait porter au
 * référentiel des provenances une interface dont il n'appelle pas une ligne
 * (ISP). Même montage que `PointOfSaleOfferReader` dans le catalogue, pour la
 * même raison.
 *
 * ⚠️ Lecture seule, et c'est le cœur de D5 : la dérivation **propose**, la
 * déclaration décide. Rien ici ne peut écrire une fiche réglementaire.
 */
export abstract class VariantDeclarationReader {
  /**
   * Les déclinaisons du produit, **dans leur ordre d'affichage**.
   *
   * Un produit inconnu rend une liste vide, comme `ofProduct` du référentiel
   * des ingrédients : la question posée est « que déclare-t-il », pas
   * « existe-t-il ».
   */
  abstract ofProduct(productId: string): Promise<readonly VariantDeclaredAllergens[]>;
}
