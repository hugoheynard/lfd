import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { ProductIngredientAllergensView, VariantAllergenGapView } from "@lfd/pim-contracts";

import { IngredientRepository } from "../domain/ports/ingredient.repository.js";
import {
  VariantDeclarationReader,
  type VariantDeclaredAllergens,
} from "../domain/ports/variant-declaration.reader.js";

/** Ce que la composition d'UNE fiche mentionne, en regard de ses déclarations. */
export class ReadProductIngredientAllergensQuery {
  constructor(readonly productId: string) {}
}

/**
 * **L'ensemble dérivé** (D5) — l'union des allergènes des ingrédients que la
 * fiche cite, et l'écart avec ce que chaque déclinaison déclare.
 *
 * Il ne stocke rien et ne décide de rien : la déclaration reste ce qui fait
 * foi, et la reprise est un geste explicite du staff. Calculer les allergènes
 * d'un produit à la lecture pour les lui appliquer réécrirait l'étiquette de
 * tout ce qui cite un ingrédient qu'on vient d'enrichir — y compris ce qui est
 * déjà imprimé et déjà servi — sans que personne ne l'ait décidé.
 *
 * 🔴 **Ce que cette réponse ne dit pas.** La liste d'ingrédients est
 * ÉDITORIALE : rien n'y garantit l'exhaustivité. Une proposition vide veut donc
 * dire « rien à proposer », jamais « composition couverte ». Le contrat nomme
 * ses champs pour ça (`citedByIngredients`, `citedNotDeclared`) et le JSDoc de
 * {@link ProductIngredientAllergensView} porte les trois conséquences de D5.
 *
 * La **maille diffère** et le contrat l'assume : les ingrédients sont cités par
 * le PRODUIT, la fiche réglementaire est portée par la DÉCLINAISON. Toutes les
 * déclinaisons reçoivent donc le même `citedByIngredients`.
 */
@QueryHandler(ReadProductIngredientAllergensQuery)
export class ReadProductIngredientAllergensHandler implements IQueryHandler<
  ReadProductIngredientAllergensQuery,
  ProductIngredientAllergensView
> {
  constructor(
    private readonly ingredients: IngredientRepository,
    private readonly declarations: VariantDeclarationReader,
  ) {}

  async execute(
    query: ReadProductIngredientAllergensQuery,
  ): Promise<ProductIngredientAllergensView> {
    const [cited, variants] = await Promise.all([
      this.ingredients.ofProduct(query.productId),
      this.declarations.ofProduct(query.productId),
    ]);
    const citedByIngredients = union(cited.map((ingredient) => ingredient.allergens));
    return {
      productId: query.productId,
      citedByIngredients,
      variants: variants.map((variant) => gapOf(variant, citedByIngredients)),
    };
  }
}

/**
 * L'écart d'UNE déclinaison — une **proposition d'ajout**, jamais un retrait.
 *
 * Un allergène déclaré à la main que la composition ignore (contamination
 * croisée d'atelier, par exemple) n'est pas contredit : le dérivé ne retire
 * rien, et cette fonction ne calcule qu'un sens.
 *
 * Sans fiche (`null`), la proposition est **vide** : fabriquer une fiche
 * réglementaire depuis une liste éditoriale est précisément le geste que
 * l'avertissement de `Ingredient` interdit (D5). Le refus est ici, dans ce que
 * l'API rend, plutôt que dans un écran qui pourrait l'oublier.
 */
function gapOf(
  variant: VariantDeclaredAllergens,
  citedByIngredients: readonly string[],
): VariantAllergenGapView {
  const declared = variant.allergens;
  return {
    variantId: variant.variantId,
    declaredAllergens: declared,
    citedNotDeclared:
      declared === null ? [] : citedByIngredients.filter((code) => !declared.includes(code)),
  };
}

/**
 * L'union des codes, dédupliquée. L'ordre vient des ingrédients, qui les
 * rangent déjà — un ensemble n'a pas d'ordre à défendre.
 */
function union(lists: readonly (readonly string[])[]): readonly string[] {
  const codes = new Set<string>();
  for (const list of lists) {
    for (const code of list) {
      codes.add(code);
    }
  }
  return [...codes].sort((left, right) => {
    if (left === right) {
      return 0;
    }
    return left < right ? -1 : 1;
  });
}
