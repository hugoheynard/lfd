import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { IngredientView } from "@lfd/pim-contracts";

import { IngredientRepository } from "../domain/ports/ingredient.repository.js";
import { toIngredientView } from "./ingredient-support.js";

/** Ce que CETTE fiche cite, dans son ordre d'affichage. */
export class ReadProductIngredientsQuery {
  constructor(readonly productId: string) {}
}

/**
 * **La composition éditoriale d'une fiche** — les matières qu'elle revendique.
 *
 * L'ordre reçu est rendu tel quel : c'est une décision éditoriale, pas un tri.
 * Le trier par nom effacerait ce que le staff a rangé à la main.
 *
 * ⚠️ Ce n'est pas la liste réglementaire au sens du règlement UE 1169/2011 :
 * rien ici ne garantit l'exhaustivité, et la fiche obligatoire appartient à la
 * déclinaison. La lecture voisine `ReadProductIngredientAllergensQuery` en tire
 * une PROPOSITION, jamais une déclaration.
 */
@QueryHandler(ReadProductIngredientsQuery)
export class ReadProductIngredientsHandler implements IQueryHandler<
  ReadProductIngredientsQuery,
  IngredientView[]
> {
  constructor(private readonly ingredients: IngredientRepository) {}

  async execute(query: ReadProductIngredientsQuery): Promise<IngredientView[]> {
    const records = await this.ingredients.ofProduct(query.productId);
    return records.map(toIngredientView);
  }
}
