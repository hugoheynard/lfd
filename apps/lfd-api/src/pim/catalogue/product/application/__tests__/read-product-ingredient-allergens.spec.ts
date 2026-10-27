import { FixedCitedAllergens } from "../../domain/ports/__tests__/fixed-cited-allergens.js";
import {
  ReadProductIngredientAllergensHandler,
  ReadProductIngredientAllergensQuery,
} from "../read-product-ingredient-allergens.js";
import { OneProduct, PRODUCT_ID, bareVariant, tarte } from "./audience-doubles.js";
import type { VariantSnapshot } from "../../domain/entities/variant.js";

function sheet(declared: readonly string[]): VariantSnapshot["allergenSheet"] {
  return { declared, mayContain: [] };
}

function second(over: Partial<VariantSnapshot>): VariantSnapshot {
  return bareVariant({ id: "var_2", sku: "PAT-7-2", isDefault: false, position: 1, ...over });
}

async function read(
  variants: readonly VariantSnapshot[] | null,
  cited: readonly string[] = ["SH"],
): Promise<Awaited<ReturnType<ReadProductIngredientAllergensHandler["execute"]>>> {
  const products = new OneProduct(variants === null ? null : tarte({ variants: [...variants] }));
  return new ReadProductIngredientAllergensHandler(
    products,
    new FixedCitedAllergens(new Map([[PRODUCT_ID, cited]])),
  ).execute(new ReadProductIngredientAllergensQuery(PRODUCT_ID));
}

describe("ReadProductIngredientAllergensHandler — jugé par le catalogue", () => {
  // La maille diffère (D5) : toutes les déclinaisons reçoivent le même dérivé.
  it("sert le même dérivé à toutes les déclinaisons du produit", async () => {
    const view = await read([
      bareVariant({ allergenSheet: sheet([]) }),
      second({ allergenSheet: sheet(["UW"]) }),
    ]);

    expect(view).toEqual({
      productId: PRODUCT_ID,
      citedByIngredients: ["SH"],
      variants: [
        { variantId: "prd_tarte_v1", declaredAllergens: [], citedNotDeclared: ["SH"] },
        { variantId: "var_2", declaredAllergens: ["UW"], citedNotDeclared: ["SH"] },
      ],
    });
  });

  it("ne propose jamais de retrait", async () => {
    const view = await read([bareVariant({ allergenSheet: sheet(["SH", "UW"]) })]);

    expect(view.variants[0]?.citedNotDeclared).toEqual([]);
  });

  // D5 : sans déclaration, rien à reprendre — le dérivé reste lisible à part.
  it("ne propose rien à une déclinaison sans fiche déclarée", async () => {
    const view = await read([bareVariant({ allergenSheet: null })], ["BWD", "SH"]);

    expect(view.variants[0]).toEqual({
      variantId: "prd_tarte_v1",
      declaredAllergens: null,
      citedNotDeclared: [],
    });
    expect(view.citedByIngredients).toEqual(["BWD", "SH"]);
  });

  it("rend un ensemble vide quand la fiche ne cite aucun ingrédient", async () => {
    const view = await read([bareVariant({ allergenSheet: sheet(["UW"]) })], []);

    expect(view.citedByIngredients).toEqual([]);
    expect(view.variants[0]?.citedNotDeclared).toEqual([]);
  });

  it("rend des listes vides pour une fiche inconnue", async () => {
    const view = await read(null, []);

    expect(view).toEqual({ productId: PRODUCT_ID, citedByIngredients: [], variants: [] });
  });

  /**
   * Régression : déclinaison alignée — l'encart de la fiche comparait SA ligne,
   * la table des produits celle du défaut ; les deux divergeaient (2026-10-27).
   */
  it("compare une déclinaison alignée à la déclaration du défaut, comme la table", async () => {
    const view = await read([
      bareVariant({ allergenSheet: sheet([]) }),
      second({ allergenSheet: null, regulatoryFollowsDefault: true }),
    ]);

    expect(view.variants[1]).toEqual({
      variantId: "var_2",
      declaredAllergens: [],
      citedNotDeclared: ["SH"],
    });
  });
});
