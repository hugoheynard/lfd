import { Sku } from "../../value-objects/sku.value-object.js";
import { Product } from "../product.js";
import { pricingSectionOf } from "../variant-pricing-section.js";

function aProduct(): Product {
  return Product.open({
    id: "prd_1",
    sku: Sku.create("CHO-001"),
    name: { fr: "Florentin" },
    kind: "daily",
    categoryId: "cat_1",
    defaultVariant: { id: "var_1", sku: Sku.create("CHO-001-1"), name: { fr: "Florentin" } },
  });
}

function sectionOf(product: Product, variantId: string) {
  return pricingSectionOf(product.snapshot().variants.find((v) => v.id === variantId));
}

describe("pricingSectionOf — ce que la section « Tarif & logistique » trace", () => {
  it("porte chaque champ de la section, et eux seuls", () => {
    expect(Object.keys(sectionOf(aProduct(), "var_1")).sort()).toEqual([
      "priceCents",
      "pricePerKgShownPro",
      "pricePerKgShownPublic",
      "proPriceMillicents",
      "proPricePerKgMillicents",
      "publicPricePerKgTtcCents",
      "saleUnit",
      "weightGrams",
      "weightMinGrams",
      "weightStepGrams",
    ]);
  });

  it("voit un changement de prix ou de poids", () => {
    const product = aProduct();
    product.priceVariant("var_1", { priceCents: 450, weightGrams: 120 });

    expect(sectionOf(product, "var_1")).toMatchObject({ priceCents: 450, weightGrams: 120 });
  });

  it("rend la section aux valeurs par défaut pour une déclinaison absente", () => {
    expect(pricingSectionOf(undefined)).toEqual({
      priceCents: null,
      weightGrams: null,
      proPriceMillicents: null,
      proPricePerKgMillicents: null,
      publicPricePerKgTtcCents: null,
      pricePerKgShownPublic: true,
      pricePerKgShownPro: true,
      saleUnit: "piece",
      weightMinGrams: null,
      weightStepGrams: null,
    });
  });
});
