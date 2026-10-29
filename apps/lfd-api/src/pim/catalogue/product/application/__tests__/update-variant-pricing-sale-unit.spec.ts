import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import { RecordingCatalogEmitter } from "../../../shared/domain/ports/__tests__/catalog-emitter-doubles.js";
import {
  SaleReferenceInUseError,
  SaleReferenceUsageUnknownError,
} from "../../domain/errors/sale-unit-errors.js";
import {
  FailingSaleReferenceUsage,
  FixedSaleReferenceUsage,
} from "../../../../channels/b2b-platform/sale-reference-usage/__tests__/sale-reference-usage-doubles.js";
import type { SaleReferenceUsage } from "../../../../channels/b2b-platform/sale-reference-usage/sale-reference-usage.js";
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
  usage: SaleReferenceUsage = new FixedSaleReferenceUsage(),
) {
  return new UpdateVariantPricingHandler(
    products,
    journal,
    new DirectUnitOfWork(),
    new RecordingCatalogEmitter(),
    usage,
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

  it("change l'unité d'une déclinaison publiée dont la référence n'a jamais servi", async () => {
    const products = new OneProduct(
      tarte({ variants: [{ ...SELLABLE_VARIANT, hasBeenPublished: true }] }),
    );
    const usage = new FixedSaleReferenceUsage();

    await pricing(
      products,
      { ...UNCHANGED, saleUnit: "weight", weightStepGrams: 100 },
      new RecordingJournal(),
      usage,
    );

    expect(products.stored?.variants[0]?.saleUnit).toBe("weight");
    // Le défaut se vend sous le SKU de sa fiche : c'est le commerce qui le
    // déduit, le référentiel ne lui passe que la déclinaison.
    expect(usage.asked).toEqual([[{ sku: "PAT-7-1", productSku: "PAT-7", isDefault: true }]]);
  });

  it("ne demande rien au commerce quand l'unité ne change pas", async () => {
    const products = new OneProduct(tarte());
    const usage = new FixedSaleReferenceUsage();

    await pricing(products, { ...UNCHANGED, saleUnit: "piece" }, new RecordingJournal(), usage);

    expect(usage.asked).toEqual([]);
  });

  it("refuse le changement d'une référence déjà commandée, sans rien écrire ni journaliser", async () => {
    const products = new OneProduct(tarte());
    const journal = new RecordingJournal();
    const usage = new FixedSaleReferenceUsage({ "PAT-7-1": ["order", "mercuriale"] });

    const attempt = pricing(
      products,
      { ...UNCHANGED, saleUnit: "weight", weightStepGrams: 100 },
      journal,
      usage,
    );

    await expect(attempt).rejects.toBeInstanceOf(SaleReferenceInUseError);
    await expect(attempt).rejects.toThrow(/déjà commandée, porte une mercuriale/u);
    expect(products.stored?.variants[0]?.saleUnit).toBe("piece");
    expect(journal.types()).toEqual([]);
  });

  it("refuse le changement quand le commerce ne répond pas : personne n'a dit non n'est pas un accord", async () => {
    const products = new OneProduct(tarte());
    const journal = new RecordingJournal();

    const attempt = pricing(
      products,
      { ...UNCHANGED, saleUnit: "weight", weightStepGrams: 100 },
      journal,
      new FailingSaleReferenceUsage(),
    );

    await expect(attempt).rejects.toBeInstanceOf(SaleReferenceUsageUnknownError);
    expect(products.stored?.variants[0]?.saleUnit).toBe("piece");
    expect(journal.types()).toEqual([]);
  });
});
