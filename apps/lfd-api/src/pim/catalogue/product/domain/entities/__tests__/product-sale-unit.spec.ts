import {
  InvalidSaleTermsError,
  PricingAlignmentAcrossUnitsError,
  SaleReferenceInUseError,
  SaleReferenceUsageUnknownError,
} from "../../errors/sale-unit-errors.js";
import type { SaleUnitClearance } from "../../value-objects/sale-reference-usage.js";
import { ProductNotActivatableError } from "../../errors/product-errors.js";
import { Sku } from "../../value-objects/sku.value-object.js";
import { Product } from "../product.js";
import type { VariantSnapshot } from "../variant.js";

/**
 * **L'unité de vente d'une déclinaison** (`documentation/pricing/vente-au-poids.md`,
 * lot P1) — pièce par défaut ; au poids, un pas et un minimum en grammes ;
 * libre tant que sa référence n'a servi nulle part, même publiée
 * (`plan-changer-l-unite-de-vente.md`, § 8), figée ensuite.
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

/** Le commerce a répondu : la référence n'a servi nulle part. */
const FREE: SaleUnitClearance = { answered: true, uses: [] };

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

    product.priceVariant(
      "var_2",
      {
        ...PRICED,
        saleUnit: "weight",
        weightStepGrams: 100,
        weightMinGrams: 200,
      },
      FREE,
    );

    expect(variantOf(product, "var_2")).toMatchObject({
      saleUnit: "weight",
      weightStepGrams: 100,
      weightMinGrams: 200,
    });
  });

  it("accepte le poids sans minimum : il est facultatif", () => {
    const product = aProduct();

    product.priceVariant("var_2", { ...PRICED, saleUnit: "weight", weightStepGrams: 50 }, FREE);

    expect(variantOf(product, "var_2")?.weightMinGrams).toBeNull();
  });

  it("enregistre le poids sans pas : c'est l'activation qui le réclame", () => {
    const product = aProduct();

    product.priceVariant("var_2", { ...PRICED, saleUnit: "weight" }, FREE);

    expect(variantOf(product, "var_2")).toMatchObject({
      saleUnit: "weight",
      weightStepGrams: null,
    });
  });

  it("change d'unité librement tant qu'elle n'a jamais été publiée", () => {
    const product = aProduct();
    product.priceVariant("var_2", { ...PRICED, saleUnit: "weight", weightStepGrams: 100 }, FREE);

    product.priceVariant("var_2", { ...PRICED, saleUnit: "piece" }, FREE);

    // Le pas et le minimum suivent l'unité : revenus à la pièce, ils s'effacent.
    expect(variantOf(product, "var_2")).toMatchObject({
      saleUnit: "piece",
      weightStepGrams: null,
      weightMinGrams: null,
    });
  });

  it("laisse l'unité inchangée quand la saisie ne la nomme pas", () => {
    const product = aProduct();
    product.priceVariant("var_2", { ...PRICED, saleUnit: "weight", weightStepGrams: 100 }, FREE);

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
      product.priceVariant("var_2", { ...PRICED, saleUnit: "weight", ...terms }, FREE),
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
    product.priceVariant("var_1", { ...PRICED, saleUnit: "weight" }, FREE);

    expect(() => product.activate(RATES, RULES, [], "public")).toThrow(ProductNotActivatableError);
    expect(() => product.activate(RATES, RULES, [], "public")).toThrow(/pas de vente au poids/u);
  });

  it("active une déclinaison au poids dont le pas est saisi", () => {
    const product = aProduct();
    product.priceVariant("var_1", { ...PRICED, saleUnit: "weight", weightStepGrams: 100 }, FREE);

    expect(product.activate(RATES, RULES, [], "public")).toBe(true);
  });
});

describe("Product — l'unité figée dès que la référence a servi", () => {
  it("marque publiées toutes les déclinaisons à la mise en vente", () => {
    const product = aPublishedProduct();

    expect(product.snapshot().variants.map((variant) => variant.hasBeenPublished)).toEqual([
      true,
      true,
    ]);
  });

  it("change l'unité d'une déclinaison publiée dont la référence n'a jamais servi", () => {
    const product = aPublishedProduct();

    product.priceVariant("var_2", { ...PRICED, saleUnit: "weight", weightStepGrams: 100 }, FREE);

    expect(variantOf(product, "var_2")).toMatchObject({ saleUnit: "weight", weightStepGrams: 100 });
  });

  it("refuse de changer l'unité d'une référence déjà utilisée, en disant où et le geste de sortie", () => {
    const product = aPublishedProduct();
    const used: SaleUnitClearance = { answered: true, uses: ["mercuriale", "order"] };
    const attempt = () => product.priceVariant("var_2", { ...PRICED, saleUnit: "weight" }, used);

    expect(attempt).toThrow(SaleReferenceInUseError);
    // Dans l'ordre du refus, pas dans celui de la réponse.
    expect(attempt).toThrow(/déjà commandée, porte une mercuriale/u);
    expect(attempt).toThrow(/Créez une autre déclinaison pour la vendre autrement/u);
    expect(variantOf(product, "var_2")?.saleUnit).toBe("piece");
  });

  it("refuse le changement quand le commerce n'a pas répondu", () => {
    const product = aProduct();
    const silent: SaleUnitClearance = { answered: false, cause: new Error("panne") };

    expect(() => product.priceVariant("var_2", { ...PRICED, saleUnit: "weight" }, silent)).toThrow(
      SaleReferenceUsageUnknownError,
    );
  });

  it("refuse le changement quand personne n'a interrogé le commerce", () => {
    const product = aProduct();

    expect(() => product.priceVariant("var_2", { ...PRICED, saleUnit: "weight" })).toThrow(
      SaleReferenceUsageUnknownError,
    );
  });

  it("laisse régler le pas et le minimum d'une déclinaison publiée au poids", () => {
    const product = aProduct();
    product.priceVariant("var_1", { ...PRICED, saleUnit: "weight", weightStepGrams: 100 }, FREE);
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

    expect(() =>
      product.priceVariant("var_2", { ...PRICED, saleUnit: "piece" }, FREE),
    ).not.toThrow();
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
    product.priceVariant("var_1", { ...PRICED, saleUnit: "weight", weightStepGrams: 100 }, FREE);

    expect(() => product.alignVariant("var_2", "pricing", true)).toThrow(
      PricingAlignmentAcrossUnitsError,
    );
  });

  it("refuse de changer l'unité du défaut que suit une déclinaison alignée", () => {
    const product = aProduct();
    product.alignVariant("var_2", "pricing", true);

    expect(() =>
      product.priceVariant("var_1", { ...PRICED, saleUnit: "weight", weightStepGrams: 100 }, FREE),
    ).toThrow(PricingAlignmentAcrossUnitsError);
  });
});
