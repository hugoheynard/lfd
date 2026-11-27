import { bareVariant, tarte } from "../../../shared/__tests__/audience-doubles.js";
import { VariantNotFoundError } from "../../errors/product-errors.js";
import { Sku } from "../../value-objects/sku.value-object.js";
import { Product } from "../product.js";

/**
 * **Sur mesure, par déclinaison** (`plan-sur-mesure-par-declinaison.md`) :
 * décoché à la naissance, réversible, une seule déclinaison bascule (V1), le
 * défaut le porte comme les autres, une déclinaison ajoutée hérite du défaut,
 * et un détachement emporte
 * la valeur de sa déclinaison.
 */

const DEFAULT_ID = "prd_tarte_v1";
const PARTS_ID = "prd_tarte_v2";

function twoVariants(options: { defaultCustom?: boolean; partsCustom?: boolean } = {}): Product {
  return Product.reconstitute(
    tarte({
      variants: [
        bareVariant({ priceCents: 3_200, customRecipe: options.defaultCustom ?? false }),
        bareVariant({
          id: PARTS_ID,
          sku: "PAT-7-2",
          name: { fr: "Six parts" },
          isDefault: false,
          position: 1,
          priceCents: 1_800,
          customRecipe: options.partsCustom ?? false,
        }),
      ],
    }),
  );
}

function customOf(product: Product): Record<string, boolean | undefined> {
  return Object.fromEntries(
    product.persistenceSnapshot().variants.map((variant) => [variant.id, variant.customRecipe]),
  );
}

function detachParts(subject: Product): Product {
  return subject.detachVariant(PARTS_ID, {
    id: "prd_neuf",
    sku: Sku.create("P-NEUF22"),
    defaultVariant: { id: "prd_neuf_v1", sku: Sku.create("P-NEUF22-1") },
  });
}

describe("Product — sur mesure par déclinaison", () => {
  it("une fiche naît ouverte : sa déclinaison par défaut n'est pas sur mesure", () => {
    const product = Product.open({
      id: "prod_1",
      sku: Sku.create("CHO-FLOR"),
      name: { fr: "Florentin" },
      kind: "daily",
      categoryId: "cat_1",
      defaultVariant: { id: "var_1", sku: Sku.create("CHO-FLOR-1"), name: { fr: "Florentin" } },
    });

    expect(product.persistenceSnapshot().variants[0]?.customRecipe).toBe(false);
  });

  it("seule la déclinaison visée bascule, et dit qu'elle a changé", () => {
    const product = twoVariants();

    expect(product.declareVariantCustomRecipe(PARTS_ID, true)).toBe(true);
    expect(customOf(product)).toEqual({ [DEFAULT_ID]: false, [PARTS_ID]: true });
  });

  it("ne dit rien changé quand elle le disait déjà — pas de fait à journaliser", () => {
    expect(twoVariants({ partsCustom: true }).declareVariantCustomRecipe(PARTS_ID, true)).toBe(
      false,
    );
  });

  it("n'est jamais résolu sur le défaut : la sœur garde sa case dans l'instantané servi", () => {
    const product = twoVariants({ defaultCustom: true });

    expect(product.snapshot().variants.map((variant) => variant.customRecipe)).toEqual([
      true,
      false,
    ]);
  });

  it("refuse la déclinaison d'une autre fiche", () => {
    expect(() => twoVariants().declareVariantCustomRecipe("prd_autre", true)).toThrow(
      VariantNotFoundError,
    );
  });

  it("se règle même archivée : le geste prépare, il ne vend pas", () => {
    const product = twoVariants();
    product.archive();

    expect(product.declareVariantCustomRecipe(PARTS_ID, true)).toBe(true);
  });

  it("garde la case à la reconstitution, et une ligne relue sans elle se lit ouverte", () => {
    const product = twoVariants();
    product.declareVariantCustomRecipe(PARTS_ID, true);
    expect(customOf(Product.reconstitute(product.persistenceSnapshot()))[PARTS_ID]).toBe(true);

    const older = bareVariant();
    expect(
      Product.reconstitute(tarte({ variants: [older] })).snapshot().variants[0]?.customRecipe,
    ).toBe(false);
  });
});

describe("Product — le défaut peut être sur mesure", () => {
  it("le défaut se coche, et se décoche", () => {
    const product = twoVariants();

    expect(product.declareVariantCustomRecipe(DEFAULT_ID, true)).toBe(true);
    expect(customOf(product)[DEFAULT_ID]).toBe(true);
    expect(product.declareVariantCustomRecipe(DEFAULT_ID, false)).toBe(true);
  });

  it("une déclinaison sur mesure devient le défaut, et le garde", () => {
    const product = twoVariants({ partsCustom: true });

    product.makeVariantDefault(PARTS_ID);

    expect(product.persistenceSnapshot().variants.find((v) => v.isDefault)?.id).toBe(PARTS_ID);
    expect(customOf(product)).toEqual({ [DEFAULT_ID]: false, [PARTS_ID]: true });
  });
});

describe("Product — sur mesure aux gestes de déclinaison", () => {
  it("une déclinaison ajoutée hérite du sur mesure du défaut", () => {
    const custom = twoVariants({ defaultCustom: true });
    const open = twoVariants({ partsCustom: true });
    const input = { sku: Sku.create("PAT-7-3"), name: { fr: "Part" }, options: {} };

    expect(custom.addVariant({ ...input, id: "v3" }).snapshot().customRecipe).toBe(true);
    expect(open.addVariant({ ...input, id: "v3" }).snapshot().customRecipe).toBe(false);
  });

  /**
   * Sans l'héritage, détacher une déclinaison réservée ferait naître une fiche
   * ouverte, servie à tous les pros dès sa validation.
   */
  it("un détachement emporte la valeur de SA déclinaison, pas celle du défaut", () => {
    expect(
      detachParts(twoVariants({ partsCustom: true })).snapshot().variants[0]?.customRecipe,
    ).toBe(true);
    expect(
      detachParts(twoVariants({ defaultCustom: true })).snapshot().variants[0]?.customRecipe,
    ).toBe(false);
  });

  it("une déclinaison désarchivée garde sa case", () => {
    const product = twoVariants({ partsCustom: true });
    product.discontinueVariant(PARTS_ID);

    product.restoreVariant(PARTS_ID);

    expect(customOf(product)[PARTS_ID]).toBe(true);
  });
});
