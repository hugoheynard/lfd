import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import { FixedSaleReferenceUsage } from "../../../../channels/b2b-platform/sale-reference-usage/__tests__/sale-reference-usage-doubles.js";
import { RecordingCatalogEmitter } from "../../../shared/domain/ports/__tests__/catalog-emitter-doubles.js";
import { InvalidProPriceError, ZeroPricePerKgError } from "../../domain/errors/product-errors.js";
import {
  UpdateVariantPricingCommand,
  UpdateVariantPricingHandler,
  type UpdateVariantPricingInput,
} from "../update-variant-pricing.js";
import { OneProduct, PRODUCT_ID, SELLABLE_VARIANT, tarte } from "./audience-doubles.js";

/** Les prix au kilo dans la section « Tarif » (`plan-prix-au-kilo.md`, K1). */

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
    new FixedSaleReferenceUsage(),
  ).execute(new UpdateVariantPricingCommand(PRODUCT_ID, SELLABLE_VARIANT.id, input));
}

const UNCHANGED = { priceCents: SELLABLE_VARIANT.priceCents, weightGrams: null } as const;

describe("UpdateVariantPricingHandler — les prix au kilo saisis", () => {
  it("une saisie du SEUL kilo se journalise, chaque montant dans son unité", async () => {
    const products = new OneProduct(tarte());
    const journal = new RecordingJournal();

    await pricing(
      products,
      { ...UNCHANGED, proPricePerKgHt: "12,40567", publicPricePerKgTtcCents: 1_590 },
      journal,
    );

    expect(products.stored?.variants[0]).toMatchObject({
      proPricePerKgMillicents: 1_240_567,
      publicPricePerKgTtcCents: 1_590,
    });
    expect(journal.types()).toEqual(["product.pricing_saved"]);
    expect(journal.entries[0]?.payload["changes"]).toEqual({
      proPricePerKgMillicents: { from: null, to: 1_240_567 },
      publicPricePerKgTtcCents: { from: null, to: 1_590 },
    });
  });

  it("absents : rien ne change, et la section passe sans trace", async () => {
    const products = new OneProduct(
      tarte({
        variants: [
          { ...SELLABLE_VARIANT, proPricePerKgMillicents: 900_000, publicPricePerKgTtcCents: 990 },
        ],
      }),
    );
    const journal = new RecordingJournal();

    await pricing(products, UNCHANGED, journal);

    expect(products.stored?.variants[0]).toMatchObject({
      proPricePerKgMillicents: 900_000,
      publicPricePerKgTtcCents: 990,
    });
    expect(journal.types()).toEqual([]);
  });

  it("refuse une sixième décimale au kilo pro, sans rien écrire", async () => {
    const products = new OneProduct(tarte());

    await expect(
      pricing(products, { ...UNCHANGED, proPricePerKgHt: "1.234567" }),
    ).rejects.toBeInstanceOf(InvalidProPriceError);
    expect(products.stored?.variants[0]?.proPricePerKgMillicents).toBeNull();
  });

  it("refuse un kilo public à zéro, sans rien écrire", async () => {
    const products = new OneProduct(tarte());

    await expect(
      pricing(products, { ...UNCHANGED, publicPricePerKgTtcCents: 0 }),
    ).rejects.toBeInstanceOf(ZeroPricePerKgError);
    expect(products.stored?.variants[0]?.publicPricePerKgTtcCents).toBeNull();
  });
});
