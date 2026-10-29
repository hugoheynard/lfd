import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import { FixedSaleReferenceUsage } from "../../../../channels/b2b-platform/sale-reference-usage/__tests__/sale-reference-usage-doubles.js";
import { RecordingCatalogEmitter } from "../../../shared/domain/ports/__tests__/catalog-emitter-doubles.js";
import { InvalidProPriceError } from "../../domain/errors/product-errors.js";
import {
  UpdateVariantPricingCommand,
  UpdateVariantPricingHandler,
  type UpdateVariantPricingInput,
} from "../update-variant-pricing.js";
import { OneProduct, PRODUCT_ID, SELLABLE_VARIANT, tarte } from "./audience-doubles.js";

/** Le prix pro HT dans la section « Tarif » (lot P, P2). */

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

/** Une fiche dont la déclinaison n'a pas encore de prix pro saisi. */
const UNPRICED_PRO = tarte({ variants: [{ ...SELLABLE_VARIANT, proPriceMillicents: null }] });

describe("UpdateVariantPricingHandler — le prix pro HT saisi", () => {
  it("range la saisie en millicentimes, et la journalise dans le diff de la section", async () => {
    const products = new OneProduct(UNPRICED_PRO);
    const journal = new RecordingJournal();

    await pricing(
      products,
      { priceCents: 3_200, weightGrams: null, proPriceHt: "27.30331" },
      journal,
    );

    expect(products.stored?.variants[0]?.proPriceMillicents).toBe(2_730_331);
    expect(journal.types()).toEqual(["product.pricing_saved"]);
    expect(journal.entries[0]?.payload["changes"]).toEqual({
      proPriceMillicents: { from: null, to: 2_730_331 },
    });
  });

  it("refuse une sixième décimale, sans rien écrire", async () => {
    const products = new OneProduct(UNPRICED_PRO);

    await expect(
      pricing(products, { priceCents: 3_200, weightGrams: null, proPriceHt: "27.303311" }),
    ).rejects.toBeInstanceOf(InvalidProPriceError);
    expect(products.stored?.variants[0]?.proPriceMillicents).toBeNull();
  });

  it("ne touche pas à la saisie quand le champ est absent", async () => {
    const products = new OneProduct(
      tarte({ variants: [{ ...SELLABLE_VARIANT, proPriceMillicents: 1_000_000 }] }),
    );

    await pricing(products, { priceCents: 3_300, weightGrams: null });

    expect(products.stored?.variants[0]).toMatchObject({
      priceCents: 3_300,
      proPriceMillicents: 1_000_000,
    });
  });

  it("efface la saisie sur un null explicite", async () => {
    const products = new OneProduct(
      tarte({ variants: [{ ...SELLABLE_VARIANT, proPriceMillicents: 1_000_000 }] }),
    );

    await pricing(products, { priceCents: 3_200, weightGrams: null, proPriceHt: null });

    expect(products.stored?.variants[0]?.proPriceMillicents).toBeNull();
  });
});
