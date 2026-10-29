import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { KnownVatRates } from "../../../shared/application/__tests__/journal-name-doubles.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import { VatRateNotFoundError } from "../../../../vat-rates/domain/errors/vat-rate-errors.js";
import { VatRateRepository } from "../../../../vat-rates/domain/ports/vat-rate.repository.js";
import type { SalesContext } from "../../../../sales-contexts/domain/value-objects/sales-context.js";
import { SalesContextRegistry } from "../../../../sales-contexts/domain/ports/sales-context.registry.js";
import { ProductUnknownContextError } from "../../domain/errors/product-errors.js";
import { Product, type ProductSnapshot } from "../../domain/entities/product.js";
import { ProductRepository } from "../../domain/ports/product.repository.js";
import { SetProductVatCommand, SetProductVatHandler } from "../set-product-vat.js";
import { RecordingCatalogEmitter } from "../../../shared/domain/ports/__tests__/catalog-emitter-doubles.js";

const CONTEXTS: readonly SalesContext[] = [
  {
    id: "ctx_emporter",
    key: "takeaway",
    label: "À emporter",
    active: true,
    position: 1,
  },
  {
    id: "ctx_b2b",
    key: "b2b",
    label: "B2B",
    active: true,
    position: 2,
  },
];

const registry: SalesContextRegistry = {
  active: () => Promise.resolve(CONTEXTS),
  // Le reste du port ne sert qu'à la surface d'administration et au boot ; ces
  // cas-ci n'en dépendent pas, et un double qui rendrait des valeurs inventées
  // mentirait plus qu'il n'aiderait.
  all: () => Promise.resolve(CONTEXTS),
  ensureRootContext: () => Promise.resolve(),
};

function snapshot(vatByContext: Readonly<Record<string, string>> = {}): ProductSnapshot {
  return {
    id: "prd_1",
    sku: "TAR-1",
    name: { fr: "Tarte" },
    slug: { fr: "tarte" },
    kind: "daily",
    categoryId: "cat_1",
    status: "draft",
    variants: [
      {
        id: "prd_1_v1",
        sku: "TAR-1-1",
        name: { fr: "Tarte" },
        options: {},
        isDefault: true,
        isDiscontinued: false,
        position: 0,
        priceCents: null,
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
    vatByContext,
    operationOnly: false,
    requiresCold: false,
    audience: null,
  };
}

/** Reconstitue à chaque lecture : un test ne doit pas passer parce qu'il tient
 *  la même instance que le handler — ce que la vraie base ne fera jamais. */
class FakeProducts extends ProductRepository {
  constructor(private stored: ProductSnapshot) {
    super();
  }
  findById(id: string): Promise<Product | null> {
    return Promise.resolve(id === this.stored.id ? Product.reconstitute(this.stored) : null);
  }
  listAll(): Promise<Product[]> {
    return Promise.resolve([]);
  }
  add(): Promise<void> {
    return Promise.resolve();
  }
  save(product: Product): Promise<void> {
    // L'instantané NON résolu, exactement comme l'adaptateur Prisma. `snapshot()`
    // résout l'héritage : l'écrire ici recopierait la fiche et le tarif du défaut
    // dans les colonnes PROPRES d'une déclinaison alignée — la faute 0b/0d du plan
    // `plan-separer-allergenes-et-nutrition.md`, rejouée par le double, qui rendait
    // vert ce que la vraie base refuse de faire (constaté le 2026-09-22).
    this.stored = product.persistenceSnapshot();
    return Promise.resolve();
  }
  get saved(): ProductSnapshot {
    return this.stored;
  }
}

function rates(): VatRateRepository {
  return new KnownVatRates({
    tva_55: { name: "Réduit", percent: 5.5 },
    tva_20: { name: "Normal", percent: 20 },
  });
}

describe("SetProductVatHandler", () => {
  it("fait DÉROGER la fiche au taux de sa famille", async () => {
    const products = new FakeProducts(snapshot());
    const journal = new RecordingJournal();

    await new SetProductVatHandler(
      products,
      rates(),
      registry,
      journal,
      new DirectUnitOfWork(),
      new RecordingCatalogEmitter(),
    ).execute(new SetProductVatCommand("prd_1", { b2b: "tva_20" }));

    expect(products.saved.vatByContext).toEqual({ b2b: "tva_20" });
    expect(journal.types()).toEqual(["product.vat_changed"]);
    // Le taux et le contexte, chacun sous son nom du moment (D5, lot D).
    expect(journal.entries[0]?.payload).toMatchObject({
      vatByContext: { b2b: { from: null, to: { id: "tva_20" } } },
      contextLabels: { b2b: "B2B" },
    });
  });

  it("rend la fiche à sa famille sur une carte VIDE", async () => {
    // Le retour à l'héritage est un geste, pas un oubli : il s'écrit en
    // retirant la ligne, jamais en posant un état « pas de dérogation » qui se
    // compterait comme un usage du taux.
    const products = new FakeProducts(snapshot({ b2b: "tva_20" }));

    await new SetProductVatHandler(
      products,
      rates(),
      registry,
      new RecordingJournal(),
      new DirectUnitOfWork(),
      new RecordingCatalogEmitter(),
    ).execute(new SetProductVatCommand("prd_1", {}));

    expect(products.saved.vatByContext).toEqual({});
  });

  it("refuse un taux fantôme", async () => {
    const products = new FakeProducts(snapshot());

    await expect(
      new SetProductVatHandler(
        products,
        rates(),
        registry,
        new RecordingJournal(),
        new DirectUnitOfWork(),
        new RecordingCatalogEmitter(),
      ).execute(new SetProductVatCommand("prd_1", { b2b: "tva_absent" })),
    ).rejects.toBeInstanceOf(VatRateNotFoundError);
    expect(products.saved.vatByContext).toEqual({});
  });

  it("refuse un contexte que le registre ne connaît pas", async () => {
    const products = new FakeProducts(snapshot());

    await expect(
      new SetProductVatHandler(
        products,
        rates(),
        registry,
        new RecordingJournal(),
        new DirectUnitOfWork(),
        new RecordingCatalogEmitter(),
      ).execute(new SetProductVatCommand("prd_1", { traiteur: "tva_20" })),
    ).rejects.toBeInstanceOf(ProductUnknownContextError);
  });

  /**
   * Régression : refusé (`ProductVatWithoutChannelError`) jusqu'au 2026-10-15.
   * Le handler ne lit même plus la famille : ce qu'elle vend ne compte plus.
   */
  it("un taux se pose pour un contexte que la famille ne vend pas", async () => {
    const products = new FakeProducts(snapshot());

    await new SetProductVatHandler(
      products,
      rates(),
      registry,
      new RecordingJournal(),
      new DirectUnitOfWork(),
      new RecordingCatalogEmitter(),
    ).execute(new SetProductVatCommand("prd_1", { b2b: "tva_20" }));

    expect(products.saved.vatByContext).toEqual({ b2b: "tva_20" });
  });

  it("reste muet quand rien n’a changé", async () => {
    const products = new FakeProducts(snapshot({ b2b: "tva_20" }));
    const journal = new RecordingJournal();

    await new SetProductVatHandler(
      products,
      rates(),
      registry,
      journal,
      new DirectUnitOfWork(),
      new RecordingCatalogEmitter(),
    ).execute(new SetProductVatCommand("prd_1", { b2b: "tva_20" }));

    expect(journal.types()).toEqual([]);
  });
});
