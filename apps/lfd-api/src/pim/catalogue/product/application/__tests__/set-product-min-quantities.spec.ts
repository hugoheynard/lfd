import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import { SalesContextRegistry } from "../../../../sales-contexts/domain/ports/sales-context.registry.js";
import type { SalesContext } from "../../../../sales-contexts/domain/value-objects/sales-context.js";
import { RecordingCatalogEmitter } from "../../../shared/domain/ports/__tests__/catalog-emitter-doubles.js";
import {
  InvalidMinQuantityError,
  MinQuantityOnWeightSaleError,
} from "../../domain/errors/min-quantity-errors.js";
import { ProductUnknownContextError } from "../../domain/errors/product-errors.js";
import type { MinQuantities } from "../../domain/value-objects/min-quantities.js";
import {
  SetProductMinQuantitiesCommand,
  SetProductMinQuantitiesHandler,
} from "../set-product-min-quantities.js";
import { OneProduct, PRODUCT_ID, bareVariant, tarte } from "./audience-doubles.js";

/** La quantité minimale d'une déclinaison (`plan-quantite-minimale.md`, M1). */

const DEFAULT_ID = "prd_tarte_v1";
const SECOND_ID = "prd_tarte_v2";

/** Le registre : trois contextes en service, et un hors service. */
class KnownContexts extends SalesContextRegistry {
  private readonly contexts: readonly SalesContext[] = [
    { id: "ctx_takeaway", key: "takeaway", label: "À emporter", active: true, position: 0 },
    { id: "ctx_eatIn", key: "eatIn", label: "Sur place", active: true, position: 1 },
    { id: "ctx_b2b", key: "b2b", label: "Professionnels", active: true, position: 2 },
    { id: "ctx_brunch", key: "brunch", label: "Brunch", active: false, position: 3 },
  ];
  active(): Promise<readonly SalesContext[]> {
    return Promise.resolve(this.contexts.filter((context) => context.active));
  }
  all(): Promise<readonly SalesContext[]> {
    return Promise.resolve(this.contexts);
  }
  ensureRootContext(): Promise<void> {
    return Promise.resolve();
  }
}

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
    new KnownContexts(),
    journal,
    new DirectUnitOfWork(),
    emitter,
  ).execute(new SetProductMinQuantitiesCommand(PRODUCT_ID, variantId, next));
}

function stored(products: OneProduct, id: string) {
  return products.stored?.variants.find((variant) => variant.id === id);
}

describe("SetProductMinQuantitiesHandler", () => {
  it("pose la grille, la journalise avant/après avec les contextes nommés, et réémet", async () => {
    const products = twoVariants();
    const journal = new RecordingJournal();
    const emitter = new RecordingCatalogEmitter();

    await setting(
      products,
      journal,
      SECOND_ID,
      { pro: { b2b: 6 }, public: { takeaway: 2 } },
      emitter,
    );

    expect(stored(products, SECOND_ID)?.minQuantities).toEqual({
      pro: { b2b: 6 },
      public: { takeaway: 2 },
    });
    expect(journal.entries).toEqual([
      expect.objectContaining({
        type: "product.min_quantities_changed",
        subjectType: "product",
        subjectId: PRODUCT_ID,
        payload: {
          subjectLabel: "Tarte au citron",
          variant: { id: SECOND_ID, name: "Boîte de 6" },
          minQuantities: {
            from: { followsDefault: false, pro: {}, public: {} },
            to: { followsDefault: false, pro: { b2b: 6 }, public: { takeaway: 2 } },
          },
          contextLabels: { takeaway: "À emporter", b2b: "Professionnels" },
        },
      }),
    ]);
    expect(emitter.products).toEqual([[PRODUCT_ID]]);
  });

  it("fait suivre le défaut, et le journal dit la grille propre restée en dormance", async () => {
    const products = twoVariants({ minQuantities: { pro: { b2b: 12 }, public: {} } });
    const journal = new RecordingJournal();

    await setting(products, journal, SECOND_ID, "follow");

    expect(stored(products, SECOND_ID)).toMatchObject({
      minQuantityFollowsDefault: true,
      minQuantities: { pro: { b2b: 12 }, public: {} },
    });
    expect(journal.entries[0]?.payload["minQuantities"]).toEqual({
      from: { followsDefault: false, pro: { b2b: 12 }, public: {} },
      to: { followsDefault: true, pro: { b2b: 12 }, public: {} },
    });
  });

  it("reste muet quand rien ne change", async () => {
    const products = twoVariants();
    const journal = new RecordingJournal();

    await setting(products, journal, DEFAULT_ID, { pro: {}, public: {} });

    expect(journal.types()).toEqual([]);
  });

  it("refuse une quantité sous 2 avant toute écriture", async () => {
    const products = twoVariants();
    const journal = new RecordingJournal();

    await expect(
      setting(products, journal, DEFAULT_ID, { pro: {}, public: { takeaway: 1 } }),
    ).rejects.toBeInstanceOf(InvalidMinQuantityError);
    expect(journal.types()).toEqual([]);
    expect(stored(products, DEFAULT_ID)?.minQuantities).toEqual({ pro: {}, public: {} });
  });

  it("refuse un contexte hors service", async () => {
    await expect(
      setting(twoVariants(), new RecordingJournal(), DEFAULT_ID, {
        pro: {},
        public: { brunch: 2 },
      }),
    ).rejects.toBeInstanceOf(ProductUnknownContextError);
  });

  it("refuse une grille sur une déclinaison au poids", async () => {
    await expect(
      setting(
        twoVariants({ saleUnit: "weight", weightStepGrams: 50 }),
        new RecordingJournal(),
        SECOND_ID,
        { pro: {}, public: { takeaway: 2 } },
      ),
    ).rejects.toBeInstanceOf(MinQuantityOnWeightSaleError);
  });
});
