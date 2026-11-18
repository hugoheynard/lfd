import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import { CustomRecipeDefaultWithoutTilesError } from "../../domain/errors/custom-recipe-errors.js";
import { ProductNotFoundError } from "../../domain/errors/product-errors.js";
import {
  SetVariantCustomRecipeCommand,
  SetVariantCustomRecipeHandler,
} from "../set-variant-custom-recipe.js";
import { RecordingCatalogEmitter } from "../../../shared/domain/ports/__tests__/catalog-emitter-doubles.js";
import { bareVariant, OneProduct, PRODUCT_ID, tarte } from "./audience-doubles.js";

/**
 * La case « Sur mesure » d'une déclinaison (`plan-sur-mesure-par-declinaison.md`,
 * V1). Ce que ces cas tiennent : le geste passe par l'agrégat, s'écrit, s'émet
 * au catalogue — c'est le commerce qui en tire D3 — et se journalise, ou se
 * tait quand rien n'a bougé ; un refus V5 n'écrit, ne journalise ni n'émet rien.
 */

const DEFAULT_ID = "prd_tarte_v1";
const PARTS_ID = "prd_tarte_v2";

function twoVariants(options: { partsCustom?: boolean; tiles?: boolean } = {}) {
  return tarte({
    variantsAsTiles: options.tiles ?? true,
    variants: [
      bareVariant(),
      bareVariant({
        id: PARTS_ID,
        sku: "PAT-7-2",
        name: { fr: "Six parts" },
        isDefault: false,
        position: 1,
        customRecipe: options.partsCustom ?? false,
      }),
    ],
  });
}

interface Scene {
  readonly products: OneProduct;
  readonly journal: RecordingJournal;
  readonly emitter: RecordingCatalogEmitter;
}

function scene(products: OneProduct): Scene {
  return { products, journal: new RecordingJournal(), emitter: new RecordingCatalogEmitter() };
}

async function declare(
  { products, journal, emitter }: Scene,
  variantId: string,
  customRecipe: boolean,
  productId = PRODUCT_ID,
): Promise<void> {
  await new SetVariantCustomRecipeHandler(
    products,
    journal,
    new DirectUnitOfWork(),
    emitter,
  ).execute(new SetVariantCustomRecipeCommand(productId, variantId, customRecipe));
}

const storedCustom = (products: OneProduct, id: string): boolean | undefined =>
  products.stored?.variants.find((variant) => variant.id === id)?.customRecipe;

describe("SetVariantCustomRecipeHandler — sur mesure par déclinaison", () => {
  it("coche la déclinaison seule, l'émet au catalogue et le dit au journal", async () => {
    const s = scene(new OneProduct(twoVariants()));

    await declare(s, PARTS_ID, true);

    expect(storedCustom(s.products, PARTS_ID)).toBe(true);
    expect(storedCustom(s.products, DEFAULT_ID)).toBe(false);
    expect(s.emitter.products).toEqual([[PRODUCT_ID]]);
    expect(s.journal.entries).toEqual([
      expect.objectContaining({
        type: "product.variant_custom_recipe_changed",
        subjectType: "product",
        subjectId: PRODUCT_ID,
        payload: {
          subjectLabel: "Tarte au citron",
          variant: { id: PARTS_ID, name: "Six parts" },
          from: false,
          to: true,
        },
      }),
    ]);
  });

  it("la décoche, et le journal dit dans quel sens", async () => {
    const s = scene(new OneProduct(twoVariants({ partsCustom: true })));

    await declare(s, PARTS_ID, false);

    expect(storedCustom(s.products, PARTS_ID)).toBe(false);
    expect(s.journal.entries.map((entry) => entry.payload)).toEqual([
      {
        subjectLabel: "Tarte au citron",
        variant: { id: PARTS_ID, name: "Six parts" },
        from: true,
        to: false,
      },
    ]);
  });

  it("reste muet quand la case est réenregistrée à l'identique", async () => {
    const s = scene(new OneProduct(twoVariants({ partsCustom: true })));

    await declare(s, PARTS_ID, true);

    expect(storedCustom(s.products, PARTS_ID)).toBe(true);
    expect(s.journal.types()).toEqual([]);
  });

  it("refuse le défaut d'une fiche sans vignettes sans rien écrire, journaliser ni émettre", async () => {
    const s = scene(new OneProduct(twoVariants({ tiles: false })));

    await expect(declare(s, DEFAULT_ID, true)).rejects.toBeInstanceOf(
      CustomRecipeDefaultWithoutTilesError,
    );
    expect(s.products.stored).toEqual(twoVariants({ tiles: false }));
    expect(s.journal.types()).toEqual([]);
    expect(s.emitter.products).toEqual([]);
  });

  it("refuse une fiche inconnue sans rien journaliser ni émettre", async () => {
    const s = scene(new OneProduct(twoVariants()));

    await expect(declare(s, PARTS_ID, true, "prd_absent")).rejects.toBeInstanceOf(
      ProductNotFoundError,
    );
    expect(s.journal.types()).toEqual([]);
    expect(s.emitter.products).toEqual([]);
  });
});
