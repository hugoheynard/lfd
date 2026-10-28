/**
 * **Parmi ces fiches, lesquelles portent au moins une image ?**
 *
 * Lu par la liste des fiches, pour le filtre « Sans image » du catalogue
 * (Hugo, 2026-10-28). Un port à part (ISP) : la liste n'a besoin que d'un oui
 * ou d'un non par fiche, pas de la couche éditoriale.
 */
export abstract class IllustratedProductsReader {
  /** Les identifiants, parmi `productIds`, qui portent au moins une image, quel que soit son rôle. */
  abstract amongst(productIds: readonly string[]): Promise<ReadonlySet<string>>;
}
