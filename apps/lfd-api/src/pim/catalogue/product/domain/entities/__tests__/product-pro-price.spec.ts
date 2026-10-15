import { ProPriceHt } from "../../value-objects/pro-price-ht.js";
import { Sku } from "../../value-objects/sku.value-object.js";
import { Product } from "../product.js";
import type { CompletenessRules } from "../../services/variant-completeness.js";

/**
 * **Le prix pro HT saisi** (lot P de `plan-catalogue-synchronise-par-audience.md`)
 * — porté par la mutation de tarif, résolu comme le prix public, pré-rempli
 * seulement là où rien n'est saisi.
 */

function aProduct(): Product {
  const product = Product.open({
    id: "prd_1",
    sku: Sku.create("CHO-001"),
    name: { fr: "Florentin" },
    kind: "daily",
    categoryId: "cat_1",
    defaultVariant: { id: "var_1", sku: Sku.create("CHO-001-1"), name: { fr: "Florentin" } },
  });
  product.addVariant({
    id: "var_2",
    sku: Sku.create("CHO-001-2"),
    name: { fr: "Boîte" },
    options: { poids: "220 g" },
  });
  return product;
}

function variantOf(product: Product, id: string) {
  return product.snapshot().variants.find((variant) => variant.id === id);
}

describe("Product — le prix pro HT dans la mutation de tarif", () => {
  it("pose le prix pro à côté du prix public", () => {
    const product = aProduct();

    product.priceVariant("var_1", {
      priceCents: 1_200,
      weightGrams: null,
      proPrice: ProPriceHt.fromEuros("10.23697"),
    });

    expect(variantOf(product, "var_1")).toMatchObject({
      priceCents: 1_200,
      proPriceMillicents: 1_023_697,
    });
  });

  it("garde le prix pro quand la saisie ne le mentionne pas", () => {
    const product = aProduct();
    product.priceVariant("var_1", {
      priceCents: 1_200,
      weightGrams: null,
      proPrice: ProPriceHt.fromEuros("10"),
    });

    product.priceVariant("var_1", { priceCents: 1_300, weightGrams: 80 });

    expect(variantOf(product, "var_1")?.proPriceMillicents).toBe(1_000_000);
  });

  it("efface le prix pro sur un null explicite", () => {
    const product = aProduct();
    product.priceVariant("var_1", {
      priceCents: 1_200,
      weightGrams: null,
      proPrice: ProPriceHt.fromEuros("10"),
    });

    product.priceVariant("var_1", { priceCents: 1_200, weightGrams: null, proPrice: null });

    expect(variantOf(product, "var_1")?.proPriceMillicents).toBeNull();
  });

  it("une déclinaison alignée sur le tarif porte le prix pro du défaut", () => {
    const product = aProduct();
    product.priceVariant("var_1", {
      priceCents: 1_200,
      weightGrams: null,
      proPrice: ProPriceHt.fromEuros("10"),
    });

    product.alignVariant("var_2", "pricing", true);

    expect(variantOf(product, "var_2")?.proPriceMillicents).toBe(1_000_000);
    // L'instantané PERSISTÉ, lui, ne recopie rien chez elle.
    const own = product.persistenceSnapshot().variants.find((v) => v.id === "var_2");
    expect(own?.proPriceMillicents).toBeNull();
  });
});

describe("Product.prefillProPrice — seulement là où rien n'est saisi", () => {
  it("écrit sur une déclinaison à tarif propre, sans saisie", () => {
    const product = aProduct();

    expect(product.prefillProPrice("var_1", ProPriceHt.fromMillicents(912_345))).toBe(true);
    expect(variantOf(product, "var_1")?.proPriceMillicents).toBe(912_345);
  });

  it("n'écrase jamais une saisie", () => {
    const product = aProduct();
    product.priceVariant("var_1", {
      priceCents: 1_200,
      weightGrams: null,
      proPrice: ProPriceHt.fromEuros("10"),
    });

    expect(product.prefillProPrice("var_1", ProPriceHt.fromMillicents(1))).toBe(false);
    expect(variantOf(product, "var_1")?.proPriceMillicents).toBe(1_000_000);
  });

  it("n'écrit rien sur une déclinaison qui suit le tarif du défaut", () => {
    const product = aProduct();
    product.alignVariant("var_2", "pricing", true);

    expect(product.prefillProPrice("var_2", ProPriceHt.fromMillicents(1))).toBe(false);
    const own = product.persistenceSnapshot().variants.find((v) => v.id === "var_2");
    expect(own?.proPriceMillicents).toBeNull();
  });

  it("garde le prix public et le poids", () => {
    const product = aProduct();
    product.priceVariant("var_1", { priceCents: 1_200, weightGrams: 80 });

    product.prefillProPrice("var_1", ProPriceHt.fromMillicents(1));

    expect(variantOf(product, "var_1")).toMatchObject({ priceCents: 1_200, weightGrams: 80 });
  });
});

describe("Product.activate — sous la méthode entered", () => {
  const RATES = { b2b: 20, takeaway: 5.5 } as const;
  const rules = (method: "entered" | "ratio_ttc"): CompletenessRules => ({
    activeContextKeys: ["b2b", "takeaway"],
    policy: { method, ratioBp: 9_000 },
  });

  function declaredAndPriced(proPrice: ProPriceHt | null): Product {
    const product = aProduct();
    product.declareAllergens("var_1", { allergens: [], mayContain: [] });
    product.declareAllergens("var_2", { allergens: [], mayContain: [] });
    product.priceVariant("var_1", { priceCents: 1_200, weightGrams: null, proPrice });
    return product;
  }

  it("refuse sans prix pro HT, en nommant les deux prix", () => {
    expect(() => declaredAndPriced(null).activate(RATES, rules("entered"))).toThrow(/prix pro HT/);
  });

  it("active avec les deux prix", () => {
    expect(declaredAndPriced(ProPriceHt.fromEuros("9")).activate(RATES, rules("entered"))).toBe(
      true,
    );
  });

  it("n'exige rien de plus sous ratio_ttc", () => {
    expect(declaredAndPriced(null).activate(RATES, rules("ratio_ttc"))).toBe(true);
  });
});
