import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import { Category } from "../../../category/domain/entities/category.js";
import { CategoryRepository } from "../../../category/domain/ports/category.repository.js";
import { TvaRate } from "../../../../commerce/domain/entities/tva-rate.js";
import { TvaRateNotFoundError } from "../../../../commerce/domain/errors/commerce-errors.js";
import { TvaRateRepository } from "../../../../commerce/domain/ports/tva-rate.repository.js";
import type { SalesChannels } from "../../../shared/domain/value-objects/sales-channels.js";
import type { SalesContext } from "../../../shared/domain/value-objects/sales-context.js";
import { SalesContextRegistry } from "../../../shared/domain/ports/sales-context.registry.js";
import {
  ProductTvaWithoutChannelError,
  ProductUnknownContextError,
} from "../../domain/errors/product-errors.js";
import { Product, type ProductSnapshot } from "../../domain/entities/product.js";
import { ProductRepository } from "../../domain/ports/product.repository.js";
import { SetProductTvaCommand, SetProductTvaHandler } from "../set-product-tva.js";

const CONTEXTS: readonly SalesContext[] = [
  {
    id: "ctx_emporter",
    key: "emporter",
    label: "À emporter",
    handleSuffix: "",
    channelKey: "emporter",
    active: true,
    shopifyProjected: true,
    position: 1,
  },
  {
    id: "ctx_b2b",
    key: "b2b",
    label: "B2B",
    handleSuffix: "-b2b",
    channelKey: "b2b",
    active: true,
    shopifyProjected: false,
    position: 2,
  },
];

const registry: SalesContextRegistry = { active: () => Promise.resolve(CONTEXTS) };

function snapshot(tvaByContext: Readonly<Record<string, string>> = {}): ProductSnapshot {
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
        allergens: null,
        nutrition: null,
      },
    ],
    tvaByContext,
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
    this.stored = product.snapshot();
    return Promise.resolve();
  }
  get saved(): ProductSnapshot {
    return this.stored;
  }
}

/** La famille du produit, et ce qu'elle vend — le seul fait que l'agrégat
 *  produit ne peut pas voir seul. */
function familySelling(channels: SalesChannels): CategoryRepository {
  const category = Category.reconstitute({
    id: "cat_1",
    name: { fr: "Tartes" },
    slug: { fr: "tartes" },
    parentId: null,
    position: 0,
    isArchived: false,
    channelPreset: channels,
    tvaByContext: { emporter: "tva_55" },
  });
  return {
    findById: () => Promise.resolve(category),
  } as unknown as CategoryRepository;
}

function rates(): TvaRateRepository {
  const known = new Map([
    ["tva_55", TvaRate.open({ id: "tva_55", name: "Réduit", description: "", percent: 5.5 })],
    ["tva_20", TvaRate.open({ id: "tva_20", name: "Normal", description: "", percent: 20 })],
  ]);
  return {
    findById: (id: string) => Promise.resolve(known.get(id) ?? null),
  } as unknown as TvaRateRepository;
}

const SELLS_ALL: SalesChannels = {
  boutiques: { emp_1: { emporter: true, surPlace: false } },
  b2b: true,
};

describe("SetProductTvaHandler", () => {
  it("fait DÉROGER la fiche au taux de sa famille", async () => {
    const products = new FakeProducts(snapshot());
    const journal = new RecordingJournal();

    await new SetProductTvaHandler(
      products,
      familySelling(SELLS_ALL),
      rates(),
      registry,
      journal,
    ).execute(new SetProductTvaCommand("prd_1", { b2b: "tva_20" }));

    expect(products.saved.tvaByContext).toEqual({ b2b: "tva_20" });
    expect(journal.types()).toEqual(["product.tva_changed"]);
  });

  it("rend la fiche à sa famille sur une carte VIDE", async () => {
    // Le retour à l'héritage est un geste, pas un oubli : il s'écrit en
    // retirant la ligne, jamais en posant un état « pas de dérogation » qui se
    // compterait comme un usage du taux.
    const products = new FakeProducts(snapshot({ b2b: "tva_20" }));

    await new SetProductTvaHandler(
      products,
      familySelling(SELLS_ALL),
      rates(),
      registry,
      new RecordingJournal(),
    ).execute(new SetProductTvaCommand("prd_1", {}));

    expect(products.saved.tvaByContext).toEqual({});
  });

  it("refuse un taux fantôme", async () => {
    const products = new FakeProducts(snapshot());

    await expect(
      new SetProductTvaHandler(
        products,
        familySelling(SELLS_ALL),
        rates(),
        registry,
        new RecordingJournal(),
      ).execute(new SetProductTvaCommand("prd_1", { b2b: "tva_absent" })),
    ).rejects.toBeInstanceOf(TvaRateNotFoundError);
    expect(products.saved.tvaByContext).toEqual({});
  });

  it("refuse un contexte que le registre ne connaît pas", async () => {
    const products = new FakeProducts(snapshot());

    await expect(
      new SetProductTvaHandler(
        products,
        familySelling(SELLS_ALL),
        rates(),
        registry,
        new RecordingJournal(),
      ).execute(new SetProductTvaCommand("prd_1", { traiteur: "tva_20" })),
    ).rejects.toBeInstanceOf(ProductUnknownContextError);
  });

  it("refuse de déroger là où la FAMILLE ne vend pas", async () => {
    // Déroger sur un contexte fermé, c'est décider d'un prix pour une vente qui
    // n'a pas lieu — et bloquer la suppression d'un taux que plus rien ne
    // facture. La règle est celle de la famille ; elle change juste de porteur.
    const products = new FakeProducts(snapshot());

    await expect(
      new SetProductTvaHandler(
        products,
        familySelling({ boutiques: { emp_1: { emporter: true, surPlace: false } }, b2b: false }),
        rates(),
        registry,
        new RecordingJournal(),
      ).execute(new SetProductTvaCommand("prd_1", { b2b: "tva_20" })),
    ).rejects.toBeInstanceOf(ProductTvaWithoutChannelError);
  });

  it("reste muet quand rien n’a changé", async () => {
    const products = new FakeProducts(snapshot({ b2b: "tva_20" }));
    const journal = new RecordingJournal();

    await new SetProductTvaHandler(
      products,
      familySelling(SELLS_ALL),
      rates(),
      registry,
      journal,
    ).execute(new SetProductTvaCommand("prd_1", { b2b: "tva_20" }));

    expect(journal.types()).toEqual([]);
  });
});
