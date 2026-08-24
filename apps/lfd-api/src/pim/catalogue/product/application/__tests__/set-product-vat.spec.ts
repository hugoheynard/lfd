import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import { Category } from "../../../category/domain/entities/category.js";
import { CategoryRepository } from "../../../category/domain/ports/category.repository.js";
import { VatRate } from "../../../../commerce/domain/entities/vat-rate.js";
import { VatRateNotFoundError } from "../../../../commerce/domain/errors/commerce-errors.js";
import { VatRateRepository } from "../../../../commerce/domain/ports/vat-rate.repository.js";
import type { SalesChannels } from "../../../shared/domain/value-objects/sales-channels.js";
import type { SalesContext } from "../../../shared/domain/value-objects/sales-context.js";
import { SalesContextRegistry } from "../../../shared/domain/ports/sales-context.registry.js";
import {
  ProductVatWithoutChannelError,
  ProductUnknownContextError,
} from "../../domain/errors/product-errors.js";
import { Product, type ProductSnapshot } from "../../domain/entities/product.js";
import { ProductRepository } from "../../domain/ports/product.repository.js";
import { CategoryUnknownEmplacementError } from "../../../category/domain/errors/category-errors.js";
import { KnownEmplacementsReader } from "../../../category/domain/ports/known-emplacements.reader.js";
import { SetProductChannelsCommand, SetProductChannelsHandler } from "../set-product-channels.js";
import { SetProductVatCommand, SetProductVatHandler } from "../set-product-vat.js";

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

function snapshot(
  tvaByContext: Readonly<Record<string, string>> = {},
  channelOverride: SalesChannels | null = null,
): ProductSnapshot {
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
    channelOverride,
  };
}

/** Tous les emplacements cités existent — le mur du `jsonb`, ouvert. */
const allEmplacementsKnown: KnownEmplacementsReader = {
  existing: (ids: readonly string[]) => Promise.resolve(new Set(ids)),
};

/** Aucun n'existe : la fiche cite un emplacement fantôme. */
const noEmplacementKnown: KnownEmplacementsReader = {
  existing: () => Promise.resolve(new Set<string>()),
};

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

function rates(): VatRateRepository {
  const known = new Map([
    ["tva_55", VatRate.open({ id: "tva_55", name: "Réduit", description: "", percent: 5.5 })],
    ["tva_20", VatRate.open({ id: "tva_20", name: "Normal", description: "", percent: 20 })],
  ]);
  return {
    findById: (id: string) => Promise.resolve(known.get(id) ?? null),
  } as unknown as VatRateRepository;
}

const SELLS_ALL: SalesChannels = {
  boutiques: { emp_1: { emporter: true, surPlace: false } },
  b2b: true,
};

describe("SetProductVatHandler", () => {
  it("fait DÉROGER la fiche au taux de sa famille", async () => {
    const products = new FakeProducts(snapshot());
    const journal = new RecordingJournal();

    await new SetProductVatHandler(
      products,
      familySelling(SELLS_ALL),
      rates(),
      registry,
      journal,
    ).execute(new SetProductVatCommand("prd_1", { b2b: "tva_20" }));

    expect(products.saved.tvaByContext).toEqual({ b2b: "tva_20" });
    expect(journal.types()).toEqual(["product.tva_changed"]);
  });

  it("rend la fiche à sa famille sur une carte VIDE", async () => {
    // Le retour à l'héritage est un geste, pas un oubli : il s'écrit en
    // retirant la ligne, jamais en posant un état « pas de dérogation » qui se
    // compterait comme un usage du taux.
    const products = new FakeProducts(snapshot({ b2b: "tva_20" }));

    await new SetProductVatHandler(
      products,
      familySelling(SELLS_ALL),
      rates(),
      registry,
      new RecordingJournal(),
    ).execute(new SetProductVatCommand("prd_1", {}));

    expect(products.saved.tvaByContext).toEqual({});
  });

  it("refuse un taux fantôme", async () => {
    const products = new FakeProducts(snapshot());

    await expect(
      new SetProductVatHandler(
        products,
        familySelling(SELLS_ALL),
        rates(),
        registry,
        new RecordingJournal(),
      ).execute(new SetProductVatCommand("prd_1", { b2b: "tva_absent" })),
    ).rejects.toBeInstanceOf(VatRateNotFoundError);
    expect(products.saved.tvaByContext).toEqual({});
  });

  it("refuse un contexte que le registre ne connaît pas", async () => {
    const products = new FakeProducts(snapshot());

    await expect(
      new SetProductVatHandler(
        products,
        familySelling(SELLS_ALL),
        rates(),
        registry,
        new RecordingJournal(),
      ).execute(new SetProductVatCommand("prd_1", { traiteur: "tva_20" })),
    ).rejects.toBeInstanceOf(ProductUnknownContextError);
  });

  it("refuse de déroger là où la FAMILLE ne vend pas", async () => {
    // Déroger sur un contexte fermé, c'est décider d'un prix pour une vente qui
    // n'a pas lieu — et bloquer la suppression d'un taux que plus rien ne
    // facture. La règle est celle de la famille ; elle change juste de porteur.
    const products = new FakeProducts(snapshot());

    await expect(
      new SetProductVatHandler(
        products,
        familySelling({ boutiques: { emp_1: { emporter: true, surPlace: false } }, b2b: false }),
        rates(),
        registry,
        new RecordingJournal(),
      ).execute(new SetProductVatCommand("prd_1", { b2b: "tva_20" })),
    ).rejects.toBeInstanceOf(ProductVatWithoutChannelError);
  });

  it("reste muet quand rien n’a changé", async () => {
    const products = new FakeProducts(snapshot({ b2b: "tva_20" }));
    const journal = new RecordingJournal();

    await new SetProductVatHandler(
      products,
      familySelling(SELLS_ALL),
      rates(),
      registry,
      journal,
    ).execute(new SetProductVatCommand("prd_1", { b2b: "tva_20" }));

    expect(journal.types()).toEqual([]);
  });
});

describe("SetProductChannelsHandler", () => {
  it("redéfinit où la fiche se vend, et le journal le note", async () => {
    const products = new FakeProducts(snapshot());
    const journal = new RecordingJournal();

    await new SetProductChannelsHandler(
      products,
      familySelling(SELLS_ALL),
      allEmplacementsKnown,
      registry,
      journal,
    ).execute(new SetProductChannelsCommand("prd_1", { boutiques: {}, b2b: true }));

    expect(products.saved.channelOverride).toEqual({ boutiques: {}, b2b: true });
    expect(journal.types()).toEqual(["product.channels_changed"]);
  });

  it("rend la fiche à sa famille avec `null`", async () => {
    const products = new FakeProducts(snapshot({}, { boutiques: {}, b2b: true }));

    await new SetProductChannelsHandler(
      products,
      familySelling(SELLS_ALL),
      allEmplacementsKnown,
      registry,
      new RecordingJournal(),
    ).execute(new SetProductChannelsCommand("prd_1", null));

    expect(products.saved.channelOverride).toBeNull();
  });

  it("refuse un emplacement qui n’existe pas", async () => {
    // La grille est du `jsonb` : aucune clé étrangère ne tient la référence. Un
    // emplacement fantôme serait accepté, persisté, puis rendu INVISIBLE par
    // l'écran, qui ignore les clés inconnues.
    const products = new FakeProducts(snapshot());

    await expect(
      new SetProductChannelsHandler(
        products,
        familySelling(SELLS_ALL),
        noEmplacementKnown,
        registry,
        new RecordingJournal(),
      ).execute(
        new SetProductChannelsCommand("prd_1", {
          boutiques: { emp_fantome: { emporter: true, surPlace: false } },
          b2b: false,
        }),
      ),
    ).rejects.toBeInstanceOf(CategoryUnknownEmplacementError);
  });

  it("EFFACE le taux d’un canal que la fiche vient de fermer", async () => {
    // La règle de la famille, un cran plus bas : sans cet effacement, une fiche
    // qui ne se vend plus en B2B garderait son taux B2B, il compterait comme un
    // usage, et la suppression de ce taux resterait bloquée par une décision que
    // plus rien n'applique.
    const products = new FakeProducts(snapshot({ b2b: "tva_20" }));

    await new SetProductChannelsHandler(
      products,
      familySelling(SELLS_ALL),
      allEmplacementsKnown,
      registry,
      new RecordingJournal(),
    ).execute(
      new SetProductChannelsCommand("prd_1", {
        boutiques: { emp_1: { emporter: true, surPlace: false } },
        b2b: false,
      }),
    );

    expect(products.saved.tvaByContext).toEqual({});
  });

  it("juge les taux sur les canaux EFFECTIFS, pas sur ceux de la famille", async () => {
    // La famille vend en B2B ; cette fiche-là non, parce qu'elle a redéfini sa
    // matrice. Elle ne peut donc pas y poser un taux — sinon elle décide d'un
    // prix pour une vente qu'elle vient elle-même de fermer.
    const products = new FakeProducts(snapshot({}, { boutiques: {}, b2b: false }));

    await expect(
      new SetProductVatHandler(
        products,
        familySelling(SELLS_ALL),
        rates(),
        registry,
        new RecordingJournal(),
      ).execute(new SetProductVatCommand("prd_1", { b2b: "tva_20" })),
    ).rejects.toBeInstanceOf(ProductVatWithoutChannelError);
  });
});
