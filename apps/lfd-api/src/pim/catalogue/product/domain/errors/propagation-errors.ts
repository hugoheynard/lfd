import { ResourceNotFoundError } from "../../../../../platform/shared/errors/app-error.js";

/**
 * L'ingrédient dont on veut propager les allergènes n'existe pas — ou plus :
 * il a pu être supprimé entre l'aperçu et l'application.
 */
export class PropagationIngredientNotFoundError extends ResourceNotFoundError {
  constructor(readonly ingredientKey: string) {
    super(
      "catalogue.allergen_propagation.ingredient_not_found",
      `Ingrédient « ${ingredientKey} » introuvable : ses allergènes ne peuvent pas être ` +
        `propagés à ses fiches. Recharger la liste des ingrédients.`,
    );
  }
}
