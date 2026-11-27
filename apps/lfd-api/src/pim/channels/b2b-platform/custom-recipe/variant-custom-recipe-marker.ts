/** Une déclinaison du référentiel, désignée comme le commerce la connaît. */
export interface CustomRecipeTarget {
  readonly productId: string;
  readonly variantId: string;
}

/**
 * **Passer une déclinaison sur mesure, au référentiel** — ce que le
 * référentiel publie pour la plateforme, et que le commerce appelle pour
 * rapprocher ses attributions (`documentation/catalogue/plan-fin-du-sur-mesure.md`,
 * D5).
 *
 * Le sur mesure est un fait de la fiche : il ne s'écrit qu'au référentiel,
 * par son vrai geste — trace au journal, fait de fiche émis, refus de
 * l'agrégat. Une écriture du commerce serait écrasée par la fiche suivante.
 */
export abstract class VariantCustomRecipeMarker {
  /**
   * Déclare la déclinaison sur mesure. Sans effet si elle l'est déjà ; le
   * commerce l'apprend par le fait de fiche, après relais.
   *
   * @throws l'erreur de l'agrégat si la fiche ou la déclinaison n'existe plus.
   */
  abstract markCustomRecipe(target: CustomRecipeTarget): Promise<void>;
}
