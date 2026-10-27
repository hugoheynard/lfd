import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { ProductIngredientAllergensView, VariantAllergenGapView } from "@lfd/pim-contracts";

import type { VariantSnapshot } from "../domain/entities/variant.js";
import { CitedAllergensReader } from "../domain/ports/cited-allergens.reader.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { citedNotDeclared } from "../domain/services/product-compliance.js";

/** Ce que la composition d'UNE fiche mentionne, en regard de ses déclarations. */
export class ReadProductIngredientAllergensQuery {
  constructor(readonly productId: string) {}
}

/**
 * **L'ensemble dérivé** (D5) — l'union des allergènes des ingrédients que la
 * fiche cite, et l'écart avec ce que chaque déclinaison déclare.
 *
 * Calculé par le CATALOGUE, sur l'agrégat résolu (`Product.resolvedVariants`)
 * et avec la règle du jugement unique (`citedNotDeclared`) : l'encart de la
 * fiche et la table des produits ne peuvent pas diverger. La route reste
 * servie par le contrôleur des ingrédients, qui ne fait que la dispatcher.
 *
 * Il ne stocke rien et ne décide de rien : la déclaration fait foi, la reprise
 * est un geste explicite du staff. 🔴 Une proposition vide veut dire « rien à
 * proposer », jamais « composition couverte » — la liste d'ingrédients est
 * éditoriale (cf. {@link ProductIngredientAllergensView}).
 *
 * La **maille diffère** : les ingrédients sont cités par le PRODUIT, la
 * déclaration est portée par la DÉCLINAISON — toutes reçoivent le même
 * `citedByIngredients`. Une fiche inconnue rend des listes vides : la question
 * est « que mentionne-t-elle », pas « existe-t-elle ».
 */
@QueryHandler(ReadProductIngredientAllergensQuery)
export class ReadProductIngredientAllergensHandler implements IQueryHandler<
  ReadProductIngredientAllergensQuery,
  ProductIngredientAllergensView
> {
  constructor(
    private readonly products: ProductRepository,
    private readonly cited: CitedAllergensReader,
  ) {}

  async execute(
    query: ReadProductIngredientAllergensQuery,
  ): Promise<ProductIngredientAllergensView> {
    const [product, cited] = await Promise.all([
      this.products.findById(query.productId),
      this.cited.ofProducts([query.productId]),
    ]);
    const citedByIngredients = cited.get(query.productId) ?? [];
    const variants = product === null ? [] : product.resolvedVariants();
    return {
      productId: query.productId,
      citedByIngredients,
      variants: [...variants]
        .sort((left, right) => left.position - right.position)
        .map((variant) => gapOf(variant, citedByIngredients)),
    };
  }
}

/** L'écart d'UNE déclinaison résolue — une proposition d'ajout, jamais un retrait. */
function gapOf(
  variant: VariantSnapshot,
  citedByIngredients: readonly string[],
): VariantAllergenGapView {
  const declared = variant.allergenSheet?.declared ?? null;
  return {
    variantId: variant.id,
    declaredAllergens: declared,
    citedNotDeclared: citedNotDeclared(declared, citedByIngredients),
  };
}
