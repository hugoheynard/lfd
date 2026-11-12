import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { IngredientView } from "@lfd/pim-contracts";

import { PimContents } from "../../changes/application/pim-contents.js";
import { listContent, PIM_CONTENT_KEYS } from "../../changes/application/pim-content-keys.js";
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
  constructor(
    private readonly ingredients: IngredientRepository,
    private readonly contents: PimContents,
  ) {}

  /** Servie sous le numéro `pim` : rien n'y dépend de l'appelant. */
  execute(): Promise<IngredientView[]> {
    return this.contents.contentOf(
      PIM_CONTENT_KEYS.ingredients,
      () => this.fromBase(),
      listContent<IngredientView>(),
    );
  }

  private async fromBase(): Promise<IngredientView[]> {
    const records = await this.ingredients.list();
    return records.map(toIngredientView);
  }
}
