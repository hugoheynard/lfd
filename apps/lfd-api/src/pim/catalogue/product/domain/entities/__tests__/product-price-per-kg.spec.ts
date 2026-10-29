import { InvalidVariantPricingError, ZeroPricePerKgError } from "../../errors/product-errors.js";
import { ProPriceHt } from "../../value-objects/pro-price-ht.js";
import { Sku } from "../../value-objects/sku.value-object.js";
import { Product } from "../product.js";

/**
 * **Les prix au kilo saisis** (`documentation/pricing/plan-prix-au-kilo.md`,
 * K1) — deux montants indépendants, jamais calculés, portés par la mutation
 * de tarif et hérités par une déclinaison alignée.
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

function priceKilo(product: Product): void {
  product.priceVariant("var_1", {
    priceCents: 1_200,
    weightGrams: 100,
    proPricePerKg: ProPriceHt.fromEuros("10.23697"),
    publicPricePerKgTtcCents: 12_400,
  });
}

describe("Product — les prix au kilo dans la mutation de tarif", () => {
  it("range les deux montants tels que saisis, chacun dans son unité", () => {
    const product = aProduct();

    priceKilo(product);

    expect(variantOf(product, "var_1")).toMatchObject({
      proPricePerKgMillicents: 1_023_697,
      publicPricePerKgTtcCents: 12_400,
    });
  });

  it("ne calcule rien : un poids et un prix changés laissent le kilo tel quel", () => {
    const product = aProduct();
    priceKilo(product);

    product.priceVariant("var_1", { priceCents: 2_000, weightGrams: 250 });

    expect(variantOf(product, "var_1")).toMatchObject({
      priceCents: 2_000,
      weightGrams: 250,
      proPricePerKgMillicents: 1_023_697,
      publicPricePerKgTtcCents: 12_400,
    });
  });

  it("efface chacun sur un null explicite, sans toucher à l'autre", () => {
    const product = aProduct();
    priceKilo(product);

    product.priceVariant("var_1", { priceCents: 1_200, weightGrams: 100, proPricePerKg: null });

    expect(variantOf(product, "var_1")).toMatchObject({
      proPricePerKgMillicents: null,
      publicPricePerKgTtcCents: 12_400,
    });
  });

  it("refuse un prix au kilo à zéro — il s'afficherait « 0,00 € / kg »", () => {
    const product = aProduct();

    expect(() =>
      product.priceVariant("var_1", {
        priceCents: 1_200,
        weightGrams: null,
        publicPricePerKgTtcCents: 0,
      }),
    ).toThrow(ZeroPricePerKgError);
    expect(() =>
      product.priceVariant("var_1", {
        priceCents: 1_200,
        weightGrams: null,
        proPricePerKg: ProPriceHt.fromEuros("0"),
      }),
    ).toThrow(ZeroPricePerKgError);
  });

  it("refuse un prix au kilo public négatif ou fractionnaire", () => {
    const product = aProduct();

    expect(() =>
      product.priceVariant("var_1", {
        priceCents: 1_200,
        weightGrams: null,
        publicPricePerKgTtcCents: 12.5,
      }),
    ).toThrow(InvalidVariantPricingError);
  });

  it("une déclinaison alignée sur le tarif porte les prix au kilo du défaut", () => {
    const product = aProduct();
    priceKilo(product);

    product.alignVariant("var_2", "pricing", true);

    expect(variantOf(product, "var_2")).toMatchObject({
      proPricePerKgMillicents: 1_023_697,
      publicPricePerKgTtcCents: 12_400,
    });
    // L'instantané PERSISTÉ, lui, ne recopie rien chez elle.
    const own = product.persistenceSnapshot().variants.find((v) => v.id === "var_2");
    expect(own).toMatchObject({ proPricePerKgMillicents: null, publicPricePerKgTtcCents: null });
  });
});

/** Les cases « afficher le prix au kilo », une par audience (`plan-carte-tarif.md`). */
describe("Product — montrer ou non le prix au kilo, par audience", () => {
  it("cochées à l'ouverture, pour le défaut comme pour une déclinaison ajoutée", () => {
    const product = aProduct();

    for (const id of ["var_1", "var_2"]) {
      expect(variantOf(product, id)).toMatchObject({
        pricePerKgShownPublic: true,
        pricePerKgShownPro: true,
      });
    }
  });

  it("décocher les particuliers laisse les pros cochés, sans effacer la saisie", () => {
    const product = aProduct();
    priceKilo(product);

    product.priceVariant("var_1", {
      priceCents: 1_200,
      weightGrams: 100,
      pricePerKgShownPublic: false,
    });
    product.priceVariant("var_1", { priceCents: 1_300, weightGrams: 100 });

    expect(variantOf(product, "var_1")).toMatchObject({
      pricePerKgShownPublic: false,
      pricePerKgShownPro: true,
      proPricePerKgMillicents: 1_023_697,
      publicPricePerKgTtcCents: 12_400,
    });
  });

  it("décocher les pros laisse les particuliers cochés", () => {
    const product = aProduct();

    product.priceVariant("var_1", {
      priceCents: 1_200,
      weightGrams: 100,
      pricePerKgShownPro: false,
    });

    expect(variantOf(product, "var_1")).toMatchObject({
      pricePerKgShownPublic: true,
      pricePerKgShownPro: false,
    });
  });

  it("une déclinaison alignée suit les cases du défaut, sans les recopier chez elle", () => {
    const product = aProduct();
    product.priceVariant("var_1", {
      priceCents: 1_200,
      weightGrams: 100,
      pricePerKgShownPro: false,
    });

    product.alignVariant("var_2", "pricing", true);

    expect(variantOf(product, "var_2")).toMatchObject({
      pricePerKgShownPublic: true,
      pricePerKgShownPro: false,
    });
    const own = product.persistenceSnapshot().variants.find((v) => v.id === "var_2");
    expect(own?.pricePerKgShownPro).toBe(true);
  });
});
