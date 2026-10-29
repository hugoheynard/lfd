import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import { Product, type ProductSnapshot } from "../../domain/entities/product.js";
import { BlankVariantInternalLabelError } from "../../domain/errors/variant-label-errors.js";
import { ProductRepository } from "../../domain/ports/product.repository.js";
import { RecordingCatalogEmitter } from "../../../shared/domain/ports/__tests__/catalog-emitter-doubles.js";
import {
  RenameProductVariantCommand,
  RenameProductVariantHandler,
} from "../rename-product-variant.js";
import { SetVariantShopNameCommand, SetVariantShopNameHandler } from "../set-variant-shop-name.js";

/**
 * Les deux gestes sur le nom d'une déclinaison
 * (`plan-identite-de-declinaison.md`, § 3) : le crayon (libellé interne, fait
 * nouveau, rien au catalogue) et la carte « Identité de la déclinaison » (nom
 * de boutique, `variant.renamed` inchangé, émis au catalogue).
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

function tarte(): OneProduct {
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
    variantsAsTiles: true,
    audience: null,
  });
}

const VARIANT = "prd_tarte_v1";

async function rename(products: OneProduct, journal: RecordingJournal, label: string) {
  await new RenameProductVariantHandler(products, journal, new DirectUnitOfWork()).execute(
    new RenameProductVariantCommand("prd_tarte", VARIANT, label),
  );
}

async function setShopName(
  products: OneProduct,
  journal: RecordingJournal,
  name: { fr: string; en?: string },
  emitter = new RecordingCatalogEmitter(),
) {
  await new SetVariantShopNameHandler(products, journal, new DirectUnitOfWork(), emitter).execute(
    new SetVariantShopNameCommand("prd_tarte", VARIANT, name),
  );
}

const stored = (products: OneProduct) => products.stored.variants[0];

describe("RenameProductVariantHandler — le libellé interne", () => {
  it("renomme le libellé, garde le nom de boutique, écrit le fait nouveau", async () => {
    const products = tarte();
    const journal = new RecordingJournal();

    await rename(products, journal, "Tarte citron (atelier)");

    expect(stored(products)?.internalLabel).toBe("Tarte citron (atelier)");
    expect(stored(products)?.name).toEqual({ fr: "Tarte au citron" });
    expect(journal.entries).toEqual([
      expect.objectContaining({
        type: "variant.internal_label_changed",
        subjectId: "prd_tarte",
        payload: {
          subjectLabel: "Tarte au citron",
          variant: { id: VARIANT, name: "Tarte citron (atelier)" },
          before: "Tarte au citron",
          after: "Tarte citron (atelier)",
        },
      }),
    ]);
  });

  it("reste muet sur un libellé inchangé", async () => {
    const journal = new RecordingJournal();

    await rename(tarte(), journal, "Tarte au citron");

    expect(journal.types()).toEqual([]);
  });

  it("refuse un libellé vide sans rien journaliser", async () => {
    const journal = new RecordingJournal();

    await expect(rename(tarte(), journal, "  ")).rejects.toBeInstanceOf(
      BlankVariantInternalLabelError,
    );
    expect(journal.types()).toEqual([]);
  });
});

describe("SetVariantShopNameHandler — le nom de boutique", () => {
  it("change le nom, fige le libellé sur l'ancien, émet et écrit variant.renamed", async () => {
    const products = tarte();
    const journal = new RecordingJournal();
    const emitter = new RecordingCatalogEmitter();

    await setShopName(
      products,
      journal,
      { fr: "Tarte citron meringuée", en: "Lemon pie" },
      emitter,
    );

    expect(stored(products)?.name).toEqual({ fr: "Tarte citron meringuée", en: "Lemon pie" });
    expect(stored(products)?.internalLabel).toBe("Tarte au citron");
    expect(emitter.products).toEqual([["prd_tarte"]]);
    expect(journal.types()).toEqual(["variant.renamed"]);
    expect(journal.entries[0]?.payload).toMatchObject({
      subjectLabel: "Tarte au citron",
      variant: { id: VARIANT, name: "Tarte citron meringuée" },
    });
  });

  it("reste muet sur un nom inchangé", async () => {
    const journal = new RecordingJournal();

    await setShopName(tarte(), journal, { fr: "Tarte au citron" });

    expect(journal.types()).toEqual([]);
  });
});
