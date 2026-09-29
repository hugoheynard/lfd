import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import { Product, type ProductSnapshot } from "../../domain/entities/product.js";
import { ProductNotFoundError } from "../../domain/errors/product-errors.js";
import { ProductRepository } from "../../domain/ports/product.repository.js";
import {
  SetProductColdRequirementCommand,
  SetProductColdRequirementHandler,
} from "../set-product-cold-requirement.js";

/**
 * La case « demande le froid » de la fiche (lot 4 bis du plan de préparation
 * de tournée, v2-2). Ce que ces cas tiennent : le geste passe par l'agrégat,
 * s'écrit, et se journalise — ou se tait quand rien n'a bougé.
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

function tarte(requiresCold: boolean): OneProduct {
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
        regulatoryFollowsDefault: false,
        nutritionFollowsDefault: false,
        pricingFollowsDefault: false,
        allergenSheet: null,
        nutrition: null,
      },
    ],
    vatByContext: {},
    channelOverride: null,
    operationOnly: false,
    requiresCold,
  });
}

async function declareCold(
  products: OneProduct,
  journal: RecordingJournal,
  requiresCold: boolean,
  id = "prd_tarte",
): Promise<void> {
  await new SetProductColdRequirementHandler(products, journal, new DirectUnitOfWork()).execute(
    new SetProductColdRequirementCommand(id, requiresCold),
  );
}

describe("SetProductColdRequirementHandler — déclarer qu'une fiche demande le froid", () => {
  it("déclare la tarte froide et le dit au journal, sous son nom du moment", async () => {
    const products = tarte(false);
    const journal = new RecordingJournal();

    await declareCold(products, journal, true);

    expect(products.stored.requiresCold).toBe(true);
    expect(journal.entries).toEqual([
      expect.objectContaining({
        type: "product.cold_requirement_changed",
        subjectType: "product",
        subjectId: "prd_tarte",
        payload: { subjectLabel: "Tarte au citron", from: false, to: true },
      }),
    ]);
  });

  it("retire le froid, et le fait dit d'où la fiche revient", async () => {
    const products = tarte(true);
    const journal = new RecordingJournal();

    await declareCold(products, journal, false);

    expect(products.stored.requiresCold).toBe(false);
    expect(journal.entries[0]?.payload).toEqual({
      subjectLabel: "Tarte au citron",
      from: true,
      to: false,
    });
  });

  it("reste muet quand la case est réenregistrée à l'identique", async () => {
    const products = tarte(true);
    const journal = new RecordingJournal();

    await declareCold(products, journal, true);

    expect(products.stored.requiresCold).toBe(true);
    expect(journal.types()).toEqual([]);
  });

  it("refuse une fiche inconnue sans rien journaliser", async () => {
    const journal = new RecordingJournal();

    await expect(declareCold(tarte(false), journal, true, "prd_absent")).rejects.toBeInstanceOf(
      ProductNotFoundError,
    );
    expect(journal.types()).toEqual([]);
  });
});
