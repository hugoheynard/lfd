import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import { RecordingCatalogEmitter } from "../../../shared/domain/ports/__tests__/catalog-emitter-doubles.js";
import { SaleUnitFrozenError } from "../../domain/errors/sale-unit-errors.js";
import {
  UpdateVariantPricingCommand,
  UpdateVariantPricingHandler,
  type UpdateVariantPricingInput,
} from "../update-variant-pricing.js";
import { OneProduct, PRODUCT_ID, SELLABLE_VARIANT, tarte } from "./audience-doubles.js";

/** L'unité de vente dans la section « Tarif » (`vente-au-poids.md`, lot P1). */

function pricing(
  products: OneProduct,
  input: UpdateVariantPricingInput,
  journal = new RecordingJournal(),
) {
  return new UpdateVariantPricingHandler(
    products,
    journal,
    new DirectUnitOfWork(),
    new RecordingCatalogEmitter(),
  ).execute(new UpdateVariantPricingCommand(PRODUCT_ID, SELLABLE_VARIANT.id, input));
}

const UNCHANGED = { priceCents: SELLABLE_VARIANT.priceCents, weightGrams: null } as const;

describe("UpdateVariantPricingHandler — l'unité de vente", () => {
  it("un passage au poids se journalise, avec son pas et son minimum", async () => {
    const products = new OneProduct(tarte());
    const journal = new RecordingJournal();

    await pricing(
      products,
      { ...UNCHANGED, saleUnit: "weight", weightStepGrams: 100, weightMinGrams: 200 },
      journal,
    );

    expect(products.stored?.variants[0]).toMatchObject({
      saleUnit: "weight",
      weightStepGrams: 100,
      weightMinGrams: 200,
    });
    expect(journal.types()).toEqual(["product.pricing_saved"]);
    expect(journal.entries[0]?.payload["changes"]).toEqual({
      saleUnit: { from: "piece", to: "weight" },
      weightStepGrams: { from: null, to: 100 },
      weightMinGrams: { from: null, to: 200 },
    });
  });

  it("absents : l'unité ne change pas, et la section passe sans trace", async () => {
    const products = new OneProduct(
      tarte({ variants: [{ ...SELLABLE_VARIANT, saleUnit: "weight", weightStepGrams: 50 }] }),
    );
    const journal = new RecordingJournal();

    await pricing(products, UNCHANGED, journal);

    expect(products.stored?.variants[0]).toMatchObject({ saleUnit: "weight", weightStepGrams: 50 });
    expect(journal.types()).toEqual([]);
  });

  it("refuse de changer l'unité d'une déclinaison déjà publiée, sans rien écrire ni journaliser", async () => {
    const products = new OneProduct(
      tarte({ variants: [{ ...SELLABLE_VARIANT, hasBeenPublished: true }] }),
    );
    const journal = new RecordingJournal();

    await expect(
      pricing(products, { ...UNCHANGED, saleUnit: "weight", weightStepGrams: 100 }, journal),
    ).rejects.toBeInstanceOf(SaleUnitFrozenError);
    expect(products.stored?.variants[0]?.saleUnit).toBe("piece");
    expect(journal.types()).toEqual([]);
  });
});
