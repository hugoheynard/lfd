import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import { FixedSaleReferenceUsage } from "../../../../channels/b2b-platform/sale-reference-usage/__tests__/sale-reference-usage-doubles.js";
import { RecordingCatalogEmitter } from "../../../shared/domain/ports/__tests__/catalog-emitter-doubles.js";
import {
  UpdateVariantPricingCommand,
  UpdateVariantPricingHandler,
  type UpdateVariantPricingInput,
} from "../update-variant-pricing.js";
import { OneProduct, PRODUCT_ID, SELLABLE_VARIANT, tarte } from "./audience-doubles.js";

/** La case « afficher le prix au kilo en boutique » (`plan-carte-tarif.md`). */

function pricing(
  products: OneProduct,
  input: UpdateVariantPricingInput,
  journal: RecordingJournal,
) {
  return new UpdateVariantPricingHandler(
    products,
    journal,
    new DirectUnitOfWork(),
    new RecordingCatalogEmitter(),
    new FixedSaleReferenceUsage(),
  ).execute(new UpdateVariantPricingCommand(PRODUCT_ID, SELLABLE_VARIANT.id, input));
}

const UNCHANGED = { priceCents: SELLABLE_VARIANT.priceCents, weightGrams: null } as const;

describe("UpdateVariantPricingHandler — montrer le prix au kilo", () => {
  it("décocher la SEULE case se journalise dans le fait de tarif", async () => {
    const products = new OneProduct(tarte());
    const journal = new RecordingJournal();

    await pricing(products, { ...UNCHANGED, pricePerKgShown: false }, journal);

    expect(products.stored?.variants[0]?.pricePerKgShown).toBe(false);
    expect(journal.types()).toEqual(["product.pricing_saved"]);
    expect(journal.entries[0]?.payload["changes"]).toEqual({
      pricePerKgShown: { from: true, to: false },
    });
  });

  it("absente : la case ne bouge pas, et la section passe sans trace", async () => {
    const products = new OneProduct(
      tarte({ variants: [{ ...SELLABLE_VARIANT, pricePerKgShown: false }] }),
    );
    const journal = new RecordingJournal();

    await pricing(products, UNCHANGED, journal);

    expect(products.stored?.variants[0]?.pricePerKgShown).toBe(false);
    expect(journal.types()).toEqual([]);
  });
});
