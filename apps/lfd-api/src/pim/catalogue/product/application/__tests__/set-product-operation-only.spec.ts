import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import { Product, type ProductSnapshot } from "../../domain/entities/product.js";
import { ProductNotFoundError } from "../../domain/errors/product-errors.js";
import { ProductRepository } from "../../domain/ports/product.repository.js";
import {
  SetProductOperationOnlyCommand,
  SetProductOperationOnlyHandler,
} from "../set-product-operation-only.js";

/**
 * La case « vendu seulement pendant une opération » de la fiche (D3 du plan des
 * opérations datées, lot 2). Ce que ces cas tiennent : le geste passe par
 * l'agrégat, s'écrit, et se journalise — ou se tait quand rien n'a bougé.
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

function buche(operationOnly: boolean): OneProduct {
  return new OneProduct({
    id: "prd_buche",
    sku: "PAT-9",
    name: { fr: "Bûche" },
    slug: { fr: "buche" },
    kind: "made_to_order",
    categoryId: "cat_patisserie",
    status: "published",
    variants: [
      {
        id: "prd_buche_v1",
        sku: "PAT-9-1",
        name: { fr: "Bûche" },
        options: {},
        isDefault: true,
        isDiscontinued: false,
        position: 0,
        priceCents: 3_200,
        weightGrams: null,
        regulatoryFollowsDefault: false,
        nutritionFollowsDefault: false,
        pricingFollowsDefault: false,
        allergenSheet: null,
        nutrition: null,
      },
    ],
    vatByContext: {},
    channelOverride: null,
    operationOnly,
  });
}

async function reserve(
  products: OneProduct,
  journal: RecordingJournal,
  operationOnly: boolean,
  id = "prd_buche",
): Promise<void> {
  await new SetProductOperationOnlyHandler(products, journal, new DirectUnitOfWork()).execute(
    new SetProductOperationOnlyCommand(id, operationOnly),
  );
}

describe("SetProductOperationOnlyHandler — réserver une fiche aux opérations", () => {
  it("réserve la bûche et le dit au journal, sous son nom du moment", async () => {
    const products = buche(false);
    const journal = new RecordingJournal();

    await reserve(products, journal, true);

    expect(products.stored.operationOnly).toBe(true);
    expect(journal.entries).toEqual([
      expect.objectContaining({
        type: "product.operation_only_changed",
        subjectType: "product",
        subjectId: "prd_buche",
        payload: { subjectLabel: "Bûche", from: false, to: true },
      }),
    ]);
  });

  it("la rend à la vente courante, et le fait dit d'où elle revient", async () => {
    const products = buche(true);
    const journal = new RecordingJournal();

    await reserve(products, journal, false);

    expect(products.stored.operationOnly).toBe(false);
    expect(journal.entries[0]?.payload).toEqual({ subjectLabel: "Bûche", from: true, to: false });
  });

  it("reste muet quand la case est réenregistrée à l'identique", async () => {
    const products = buche(true);
    const journal = new RecordingJournal();

    await reserve(products, journal, true);

    expect(products.stored.operationOnly).toBe(true);
    expect(journal.types()).toEqual([]);
  });

  it("refuse une fiche inconnue sans rien journaliser", async () => {
    const journal = new RecordingJournal();

    await expect(reserve(buche(false), journal, true, "prd_absent")).rejects.toBeInstanceOf(
      ProductNotFoundError,
    );
    expect(journal.types()).toEqual([]);
  });
});
