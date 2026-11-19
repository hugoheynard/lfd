import { VariantNotFoundError, VariantNotInProductError } from "../../errors/product-errors.js";
import { Sku } from "../../value-objects/sku.value-object.js";
import { Product } from "../product.js";

function aProduct(): Product {
  return Product.open({
    id: "prd_1",
    sku: Sku.create("CHO-001"),
    name: { fr: "Gros florentin" },
    kind: "daily",
    categoryId: "cat_1",
    defaultVariant: { id: "var_1", sku: Sku.create("CHO-001-1"), name: { fr: "Boîte" } },
  });
}

/**
 * Les gestes de déclinaison passent par la fiche : une requête forgée sur
 * l'identifiant d'une déclinaison d'une AUTRE fiche n'a aucun effet.
 */
describe("ProductLineup — la fiche garde ses déclinaisons", () => {
  const FOREIGN = "var_d_une_autre_fiche";

  it("refuse chaque geste adressé à une déclinaison qui n'est pas la sienne", () => {
    const product = aProduct();
    const gestures: readonly (() => unknown)[] = [
      () => product.renameVariantForShop(FOREIGN, { fr: "x" }),
      () => product.variantInternalLabel(FOREIGN),
      () => product.renameVariantInternalLabel(FOREIGN, "x"),
      () => product.priceVariant(FOREIGN, { priceCents: 100, weightGrams: 10 }),
      () => product.requireVariant(FOREIGN),
      () => product.declareVariantCustomRecipe(FOREIGN, true),
      () => product.discontinueVariant(FOREIGN),
      () => product.restoreVariant(FOREIGN),
      () => product.makeVariantDefault(FOREIGN),
      () => product.detachedProductOf(FOREIGN),
      () => product.ownAllergenDeclaration(FOREIGN),
    ];
    for (const gesture of gestures) {
      expect(gesture).toThrow(VariantNotFoundError);
    }
    expect(() => product.alignVariant(FOREIGN, "pricing", true)).toThrow(VariantNotInProductError);
  });

  it("une déclinaison ajoutée sur une fiche en ligne part déjà publiée", () => {
    const product = Product.reconstitute({ ...aProduct().snapshot(), status: "published" });
    const added = product.addVariant({
      id: "var_2",
      sku: Sku.create("CHO-001-2"),
      name: { fr: "Sœur" },
      options: {},
    });
    expect(added.snapshot().hasBeenPublished).toBe(true);
    expect(product.nextVariantPosition).toBe(2);
  });
});

describe("ProductLineup — ce qu'une déclinaison déclare elle-même", () => {
  it("ne rend rien tant que la déclinaison n'a rien déclaré", () => {
    expect(aProduct().ownAllergenDeclaration("var_1")).toBeNull();
  });

  it("rend la déclaration posée par le verbe, traces comprises", () => {
    const product = aProduct();
    product.declareAllergens("var_1", { allergens: ["gluten"], mayContain: ["nuts"] });

    expect(product.ownAllergenDeclaration("var_1")).toEqual({
      allergens: ["gluten"],
      mayContain: ["nuts"],
    });
  });

  it("distingue « aucun allergène » déclaré d'une absence de déclaration", () => {
    const product = aProduct();
    product.declareAllergens("var_1", { allergens: [], mayContain: [] });

    expect(product.ownAllergenDeclaration("var_1")).toEqual({ allergens: [], mayContain: [] });
  });

  it("rend la moitié PROPRE d'une sœur alignée, pas celle du défaut qu'elle suit", () => {
    const product = aProduct();
    product.declareAllergens("var_1", { allergens: ["gluten"], mayContain: [] });
    product.addVariant({
      id: "var_2",
      sku: Sku.create("CHO-001-2"),
      name: { fr: "Sœur" },
      options: {},
    });

    expect(product.ownAllergenDeclaration("var_2")).toBeNull();
  });
});
