import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import { Product, type ProductSnapshot } from "../../domain/entities/product.js";
import { ProductNotFoundError } from "../../domain/errors/product-errors.js";
import { ProductRepository } from "../../domain/ports/product.repository.js";
import {
  SetProductVariantsAsTilesCommand,
  SetProductVariantsAsTilesHandler,
} from "../set-product-variants-as-tiles.js";
import { RecordingCatalogEmitter } from "../../../shared/domain/ports/__tests__/catalog-emitter-doubles.js";

/**
 * La case « Montrer chaque déclinaison en vignette » de la fiche
 * (`plan-declinaisons-en-vignette.md`, V1). Ce que ces cas tiennent : le geste
 * passe par l'agrégat, s'écrit, s'émet au catalogue et se journalise — ou se
 * tait quand rien n'a bougé.
 */

/** Reconstitue à chaque lecture : le handler ne tient pas l'instance du test. */
class OneProduct extends ProductRepository {
  constructor(private current: ProductSnapshot) {
    super();
  }
  get stored(): ProductSnapshot {
    return this.current;
  }
  findById(id: string): Promise<Product | null> {
    return Promise.resolve(id === this.current.id ? Product.reconstitute(this.current) : null);
  }
  listAll(): Promise<Product[]> {
    return Promise.resolve([]);
  }
  add(product: Product): Promise<void> {
    return this.save(product);
  }
  save(product: Product): Promise<void> {
    this.current = product.persistenceSnapshot();
    return Promise.resolve();
  }
}

function tarte(variantsAsTiles: boolean): OneProduct {
  return new OneProduct({
    id: "prd_tarte",
    sku: "PAT-7",
    name: { fr: "Tarte au citron" },
    slug: { fr: "tarte-au-citron" },
    kind: "made_to_order",
    categoryId: "cat_patisserie",
    status: "published",
    variants: [
      {
        id: "prd_tarte_v1",
        sku: "PAT-7-1",
        name: { fr: "Tarte au citron" },
        options: {},
        isDefault: true,
        isDiscontinued: false,
        position: 0,
        priceCents: 3_200,
        weightGrams: null,
        proPriceMillicents: null,
        proPricePerKgMillicents: null,
        publicPricePerKgTtcCents: null,
        pricePerKgShown: true,
        saleUnit: "piece",
        weightMinGrams: null,
        weightStepGrams: null,
        hasBeenPublished: false,
        regulatoryFollowsDefault: false,
        nutritionFollowsDefault: false,
        pricingFollowsDefault: false,
        minQuantities: { pro: null, public: null },
        minQuantityFollowsDefault: false,
        allergenSheet: null,
        nutrition: null,
      },
    ],
    vatByContext: {},
    operationOnly: false,
    requiresCold: false,
    variantsAsTiles,
    audience: null,
  });
}

async function showTiles(
  products: OneProduct,
  journal: RecordingJournal,
  variantsAsTiles: boolean,
  id = "prd_tarte",
  emitter = new RecordingCatalogEmitter(),
): Promise<void> {
  await new SetProductVariantsAsTilesHandler(
    products,
    journal,
    new DirectUnitOfWork(),
    emitter,
  ).execute(new SetProductVariantsAsTilesCommand(id, variantsAsTiles));
}

describe("SetProductVariantsAsTilesHandler — montrer chaque déclinaison en vignette", () => {
  it("décoche l'option, l'émet au catalogue et le dit au journal", async () => {
    const products = tarte(true);
    const journal = new RecordingJournal();
    const emitter = new RecordingCatalogEmitter();

    await showTiles(products, journal, false, "prd_tarte", emitter);

    expect(products.stored.variantsAsTiles).toBe(false);
    expect(emitter.products).toEqual([["prd_tarte"]]);
    expect(journal.entries).toEqual([
      expect.objectContaining({
        type: "product.variants_as_tiles_changed",
        subjectType: "product",
        subjectId: "prd_tarte",
        payload: { subjectLabel: "Tarte au citron", from: true, to: false },
      }),
    ]);
  });

  it("reste muet quand la case est réenregistrée à l'identique", async () => {
    const products = tarte(true);
    const journal = new RecordingJournal();

    await showTiles(products, journal, true);

    expect(products.stored.variantsAsTiles).toBe(true);
    expect(journal.types()).toEqual([]);
  });

  it("refuse une fiche inconnue sans rien journaliser", async () => {
    const journal = new RecordingJournal();

    await expect(showTiles(tarte(false), journal, true, "prd_absent")).rejects.toBeInstanceOf(
      ProductNotFoundError,
    );
    expect(journal.types()).toEqual([]);
  });
});
