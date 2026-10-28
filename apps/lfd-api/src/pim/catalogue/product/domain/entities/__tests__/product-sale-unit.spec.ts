import {
  InvalidSaleTermsError,
  PricingAlignmentAcrossUnitsError,
  SaleUnitFrozenError,
} from "../../errors/sale-unit-errors.js";
import { ProductNotActivatableError } from "../../errors/product-errors.js";
import { Sku } from "../../value-objects/sku.value-object.js";
import { Product } from "../product.js";
import type { VariantSnapshot } from "../variant.js";

/**
 * **L'unité de vente d'une déclinaison** (`documentation/pricing/plan-vente-au-poids.md`,
 * lot P1) — pièce par défaut ; au poids, un pas et un minimum en grammes ;
 * libre jusqu'à la première publication, figée ensuite.
 */

const RATES = { b2b: 5.5 };
const RULES = { activeContextKeys: ["b2b"] };

function aProduct(): Product {
  const product = Product.open({
    id: "prd_1",
    sku: Sku.create("VRC-001"),
    name: { fr: "Graines au chocolat" },
    kind: "resale",
    categoryId: "cat_1",
    defaultVariant: { id: "var_1", sku: Sku.create("VRC-001-1"), name: { fr: "Vrac" } },
  });
  product.addVariant({
    id: "var_2",
    sku: Sku.create("VRC-001-2"),
    name: { fr: "Sachet" },
    options: {},
  });
  return product;
}

function variantOf(product: Product, id: string): VariantSnapshot | undefined {
  return product.snapshot().variants.find((variant) => variant.id === id);
}

const PRICED = { priceCents: 1_240, weightGrams: null } as const;

/** Une fiche vendable, mise en vente : toutes ses déclinaisons partent avec. */
function aPublishedProduct(): Product {
  const product = aProduct();
  product.priceVariant("var_1", { ...PRICED });
  product.activate(RATES, RULES, [], "public");
  return product;
}

describe("Product — l'unité de vente d'une déclinaison", () => {
  it("naît à la pièce, sans pas ni minimum, jamais publiée", () => {
    expect(variantOf(aProduct(), "var_2")).toMatchObject({
      saleUnit: "piece",
      weightMinGrams: null,
      weightStepGrams: null,
      hasBeenPublished: false,
    });
  });

  it("passe au poids avec son pas et son minimum, en grammes", () => {
    const product = aProduct();

    product.priceVariant("var_2", {
      ...PRICED,
      saleUnit: "weight",
      weightStepGrams: 100,
      weightMinGrams: 200,
    });

    expect(variantOf(product, "var_2")).toMatchObject({
      saleUnit: "weight",
      weightStepGrams: 100,
      weightMinGrams: 200,
    });
  });

  it("accepte le poids sans minimum : il est facultatif", () => {
    const product = aProduct();

    product.priceVariant("var_2", { ...PRICED, saleUnit: "weight", weightStepGrams: 50 });

    expect(variantOf(product, "var_2")?.weightMinGrams).toBeNull();
  });

  it("enregistre le poids sans pas : c'est l'activation qui le réclame", () => {
    const product = aProduct();

    product.priceVariant("var_2", { ...PRICED, saleUnit: "weight" });

    expect(variantOf(product, "var_2")).toMatchObject({
      saleUnit: "weight",
      weightStepGrams: null,
    });
  });

  it("change d'unité librement tant qu'elle n'a jamais été publiée", () => {
    const product = aProduct();
    product.priceVariant("var_2", { ...PRICED, saleUnit: "weight", weightStepGrams: 100 });

    product.priceVariant("var_2", { ...PRICED, saleUnit: "piece" });

    // Le pas et le minimum suivent l'unité : revenus à la pièce, ils s'effacent.
    expect(variantOf(product, "var_2")).toMatchObject({
      saleUnit: "piece",
      weightStepGrams: null,
      weightMinGrams: null,
    });
  });

  it("laisse l'unité inchangée quand la saisie ne la nomme pas", () => {
    const product = aProduct();
    product.priceVariant("var_2", { ...PRICED, saleUnit: "weight", weightStepGrams: 100 });

    product.priceVariant("var_2", { priceCents: 1_500, weightGrams: null });

    expect(variantOf(product, "var_2")).toMatchObject({ saleUnit: "weight", weightStepGrams: 100 });
  });

  it.each([
    ["un pas nul", { weightStepGrams: 0 }],
    ["un pas négatif", { weightStepGrams: -100 }],
    ["un pas fractionnaire", { weightStepGrams: 12.5 }],
    ["un minimum nul", { weightStepGrams: 100, weightMinGrams: 0 }],
  ] as const)("refuse %s", (_label, terms) => {
    const product = aProduct();

    expect(() =>
      product.priceVariant("var_2", { ...PRICED, saleUnit: "weight", ...terms }),
    ).toThrow(InvalidSaleTermsError);
    expect(variantOf(product, "var_2")?.saleUnit).toBe("piece");
  });

  it("refuse un pas posé sur une déclinaison vendue à la pièce", () => {
    const product = aProduct();

    expect(() => product.priceVariant("var_2", { ...PRICED, weightStepGrams: 100 })).toThrow(
      InvalidSaleTermsError,
    );
  });
});

describe("Product — activer une fiche au poids", () => {
  it("refuse une déclinaison au poids sans pas, en nommant ce qui manque", () => {
    const product = aProduct();
    product.priceVariant("var_1", { ...PRICED, saleUnit: "weight" });

    expect(() => product.activate(RATES, RULES, [], "public")).toThrow(ProductNotActivatableError);
    expect(() => product.activate(RATES, RULES, [], "public")).toThrow(/pas de vente au poids/u);
  });

  it("active une déclinaison au poids dont le pas est saisi", () => {
    const product = aProduct();
    product.priceVariant("var_1", { ...PRICED, saleUnit: "weight", weightStepGrams: 100 });

    expect(product.activate(RATES, RULES, [], "public")).toBe(true);
  });
});

describe("Product — l'unité figée après la première publication", () => {
  it("marque publiées toutes les déclinaisons à la mise en vente", () => {
    const product = aPublishedProduct();

    expect(product.snapshot().variants.map((variant) => variant.hasBeenPublished)).toEqual([
      true,
      true,
    ]);
  });

  it("refuse de changer l'unité d'une déclinaison déjà publiée, en nommant le geste de sortie", () => {
    const product = aPublishedProduct();

    expect(() => product.priceVariant("var_2", { ...PRICED, saleUnit: "weight" })).toThrow(
      SaleUnitFrozenError,
    );
    expect(() => product.priceVariant("var_2", { ...PRICED, saleUnit: "weight" })).toThrow(
      /créez une autre déclinaison/u,
    );
  });

  it("reste figée après un retrait de la vente : elle a pu être commandée", () => {
    const product = aPublishedProduct();
    product.deactivate();

    expect(() => product.priceVariant("var_2", { ...PRICED, saleUnit: "weight" })).toThrow(
      SaleUnitFrozenError,
    );
  });

  it("laisse régler le pas et le minimum d'une déclinaison publiée au poids", () => {
    const product = aProduct();
    product.priceVariant("var_1", { ...PRICED, saleUnit: "weight", weightStepGrams: 100 });
    product.activate(RATES, RULES, [], "public");

    product.priceVariant("var_1", { ...PRICED, weightStepGrams: 50, weightMinGrams: 250 });

    expect(variantOf(product, "var_1")).toMatchObject({
      saleUnit: "weight",
      weightStepGrams: 50,
      weightMinGrams: 250,
    });
  });

  it("accepte de renvoyer la même unité sur une déclinaison publiée", () => {
    const product = aPublishedProduct();

    expect(() => product.priceVariant("var_2", { ...PRICED, saleUnit: "piece" })).not.toThrow();
  });

  it("publie d'office la déclinaison ajoutée à une fiche en vente", () => {
    const product = aPublishedProduct();

    product.addVariant({
      id: "var_3",
      sku: Sku.create("VRC-001-3"),
      name: { fr: "Seau" },
      options: {},
    });

    expect(variantOf(product, "var_3")?.hasBeenPublished).toBe(true);
  });
});

describe("Product — l'unité ne s'hérite pas du défaut", () => {
  it("garde sa propre unité quand elle suit le tarif du défaut", () => {
    const product = aProduct();
    product.alignVariant("var_2", "pricing", true);

    product.priceVariant("var_1", { ...PRICED });

    expect(variantOf(product, "var_2")?.saleUnit).toBe("piece");
  });

  it("refuse d'aligner le tarif sur un défaut vendu dans une autre unité", () => {
    const product = aProduct();
    product.priceVariant("var_1", { ...PRICED, saleUnit: "weight", weightStepGrams: 100 });

    expect(() => product.alignVariant("var_2", "pricing", true)).toThrow(
      PricingAlignmentAcrossUnitsError,
    );
  });

  it("refuse de changer l'unité du défaut que suit une déclinaison alignée", () => {
    const product = aProduct();
    product.alignVariant("var_2", "pricing", true);

    expect(() =>
      product.priceVariant("var_1", { ...PRICED, saleUnit: "weight", weightStepGrams: 100 }),
    ).toThrow(PricingAlignmentAcrossUnitsError);
  });
});
