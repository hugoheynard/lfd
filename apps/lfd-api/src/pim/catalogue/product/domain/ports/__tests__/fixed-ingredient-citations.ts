import {
  IngredientCitationsReader,
  type IngredientCitations,
} from "../ingredient-citations.reader.js";

/** Les citations d'UN ingrédient, posées par le test — et modifiables entre deux appels. */
export class FixedIngredientCitations extends IngredientCitationsReader {
  constructor(public current: IngredientCitations | null) {
    super();
  }

  citationsOf(ingredientKey: string): Promise<IngredientCitations | null> {
    return Promise.resolve(this.current?.ingredient.key === ingredientKey ? this.current : null);
  }
}
