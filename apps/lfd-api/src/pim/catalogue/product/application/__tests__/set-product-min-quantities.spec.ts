import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import { RecordingCatalogEmitter } from "../../../shared/domain/ports/__tests__/catalog-emitter-doubles.js";
import {
  InvalidMinQuantityError,
  MinQuantityOnWeightSaleError,
} from "../../domain/errors/min-quantity-errors.js";
import type { MinQuantities } from "../../domain/value-objects/min-quantities.js";
import {
  SetProductMinQuantitiesCommand,
  SetProductMinQuantitiesHandler,
} from "../set-product-min-quantities.js";
import { OneProduct, PRODUCT_ID, bareVariant, tarte } from "./audience-doubles.js";

/** La quantité minimale d'une déclinaison, par audience (`plan-quantite-minimale.md`, M1). */

const DEFAULT_ID = "prd_tarte_v1";
const SECOND_ID = "prd_tarte_v2";

function twoVariants(second: Parameters<typeof bareVariant>[0] = {}): OneProduct {
  return new OneProduct(
    tarte({
      variants: [
        bareVariant(),
        bareVariant({
          id: SECOND_ID,
          sku: "PAT-7-2",
          name: { fr: "Boîte de 6" },
          isDefault: false,
          position: 1,
          ...second,
        }),
      ],
    }),
  );
}

async function setting(
  products: OneProduct,
  journal: RecordingJournal,
  variantId: string,
  next: MinQuantities | "follow",
  emitter = new RecordingCatalogEmitter(),
): Promise<void> {
  await new SetProductMinQuantitiesHandler(
    products,
    journal,
    new DirectUnitOfWork(),
    emitter,
  ).execute(new SetProductMinQuantitiesCommand(PRODUCT_ID, variantId, next));
}

function stored(products: OneProduct, id: string) {
  return products.stored?.variants.find((variant) => variant.id === id);
}

describe("SetProductMinQuantitiesHandler", () => {
  it("pose les minimums, les journalise avant/après, et réémet", async () => {
    const products = twoVariants();
    const journal = new RecordingJournal();
    const emitter = new RecordingCatalogEmitter();

    await setting(products, journal, SECOND_ID, { pro: 6, public: 2 }, emitter);

    expect(stored(products, SECOND_ID)?.minQuantities).toEqual({ pro: 6, public: 2 });
    expect(journal.entries).toEqual([
      expect.objectContaining({
        type: "product.min_quantities_changed",
        subjectType: "product",
        subjectId: PRODUCT_ID,
        payload: {
          subjectLabel: "Tarte au citron",
          variant: { id: SECOND_ID, name: "Boîte de 6" },
          minQuantities: {
            from: { followsDefault: false, pro: null, public: null },
            to: { followsDefault: false, pro: 6, public: 2 },
          },
        },
      }),
    ]);
    expect(emitter.products).toEqual([[PRODUCT_ID]]);
  });

  it("fait suivre le défaut, et le journal dit les minimums propres restés en dormance", async () => {
    const products = twoVariants({ minQuantities: { pro: 12, public: null } });
    const journal = new RecordingJournal();

    await setting(products, journal, SECOND_ID, "follow");

    expect(stored(products, SECOND_ID)).toMatchObject({
      minQuantityFollowsDefault: true,
      minQuantities: { pro: 12, public: null },
    });
    expect(journal.entries[0]?.payload["minQuantities"]).toEqual({
      from: { followsDefault: false, pro: 12, public: null },
      to: { followsDefault: true, pro: 12, public: null },
    });
  });

  it("reste muet quand rien ne change", async () => {
    const products = twoVariants();
    const journal = new RecordingJournal();

    await setting(products, journal, DEFAULT_ID, { pro: null, public: null });

    expect(journal.types()).toEqual([]);
  });

  it("refuse une quantité sous 2 avant toute écriture", async () => {
    const products = twoVariants();
    const journal = new RecordingJournal();

    await expect(
      setting(products, journal, DEFAULT_ID, { pro: null, public: 1 }),
    ).rejects.toBeInstanceOf(InvalidMinQuantityError);
    expect(journal.types()).toEqual([]);
    expect(stored(products, DEFAULT_ID)?.minQuantities).toEqual({ pro: null, public: null });
  });

  it("refuse un minimum sur une déclinaison au poids", async () => {
    await expect(
      setting(
        twoVariants({ saleUnit: "weight", weightStepGrams: 50 }),
        new RecordingJournal(),
        SECOND_ID,
        { pro: null, public: 2 },
      ),
    ).rejects.toBeInstanceOf(MinQuantityOnWeightSaleError);
  });
});
