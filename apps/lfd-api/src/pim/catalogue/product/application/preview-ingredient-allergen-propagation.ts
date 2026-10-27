import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { IngredientAllergenPropagationView } from "@lfd/pim-contracts";

import { AllergenCatalogueReader } from "../../../allergens/domain/ports/allergen-catalogue.reader.js";
import { IngredientCitationsReader } from "../domain/ports/ingredient-citations.reader.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { propagationCounts } from "../domain/services/ingredient-allergen-propagation.js";
import { loadPropagationPlan } from "./ingredient-allergen-propagation-support.js";

export class PreviewIngredientAllergenPropagationQuery {
  constructor(
    readonly ingredientKey: string,
    readonly added: readonly string[],
    readonly removed: readonly string[],
  ) {}
}

/**
 * **L'aperçu de la propagation** — lecture seule, rien n'est écrit (D5 : la
 * composition propose, le geste décide).
 *
 * Calculé par le CATALOGUE : il possède les déclarations, l'alignement des
 * déclinaisons et le jugement. Les citations arrivent par le port que la
 * provenance implémente.
 *
 * @throws {PropagationIngredientNotFoundError} aucun ingrédient sous cette clé.
 */
@QueryHandler(PreviewIngredientAllergenPropagationQuery)
export class PreviewIngredientAllergenPropagationHandler implements IQueryHandler<
  PreviewIngredientAllergenPropagationQuery,
  IngredientAllergenPropagationView
> {
  constructor(
    private readonly citations: IngredientCitationsReader,
    private readonly products: ProductRepository,
    private readonly reference: AllergenCatalogueReader,
  ) {}

  async execute(
    query: PreviewIngredientAllergenPropagationQuery,
  ): Promise<IngredientAllergenPropagationView> {
    const plan = await loadPropagationPlan(
      this.citations,
      this.products,
      this.reference,
      query.ingredientKey,
      {
        added: query.added,
        removed: query.removed,
      },
    );
    const products = plan.products.map((entry) => entry.propagation);
    return {
      ingredientKey: plan.ingredient.key,
      ingredientName: plan.ingredient.name,
      added: plan.change.added,
      removed: plan.change.removed,
      // Le détail interne (`keptByOtherIngredient`) ne sort que par les comptes.
      products: products.map((product) => ({
        ...product,
        variants: product.variants.map(({ keptByOtherIngredient, ...variant }) => {
          void keptByOtherIngredient;
          return variant;
        }),
      })),
      counts: propagationCounts(products, plan.change),
    };
  }
}
