import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { IngredientView } from "@lfd/pim-contracts";

import { IngredientRepository } from "../domain/ports/ingredient.repository.js";
import { toIngredientView } from "./ingredient-support.js";

/** Le référentiel des provenances **entier**, pour l'écran qui l'administre. Sans paramètre. */
export class ListIngredientsQuery {}

/**
 * Les matières telles que l'écran les administre — avec leur appellation déjà
 * résolue et ce qui les retient, pour que la ligne dise avant le clic si elle
 * est effaçable.
 */
@QueryHandler(ListIngredientsQuery)
export class ListIngredientsHandler implements IQueryHandler<
  ListIngredientsQuery,
  IngredientView[]
> {
  constructor(private readonly ingredients: IngredientRepository) {}

  async execute(): Promise<IngredientView[]> {
    const records = await this.ingredients.list();
    return records.map(toIngredientView);
  }
}
