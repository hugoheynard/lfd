import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import { Category } from "../../../category/domain/entities/category.js";
import { CategoryRepository } from "../../../category/domain/ports/category.repository.js";
import { Product, type ProductSnapshot } from "../../domain/entities/product.js";
import { ProductRepository } from "../../domain/ports/product.repository.js";
import {
  UpdateProductIdentityCommand,
  UpdateProductIdentityHandler,
} from "../update-product-identity.js";

/**
 * Changer de famille change les taux dont la fiche hérite : un fait dédié,
 * `product.reclassified`, que la comptabilité relit (Hugo, 2026-09-19) — et
 * SEULEMENT quand la famille change réellement.
 */

/** Leurs noms — ceux que le journal doit figer à côté de l'identifiant. */
const FAMILY_NAMES: Readonly<Record<string, string>> = {
  cat_tartes: "Tartes",
  cat_gateaux: "Gâteaux",
};

/** Deux familles vivantes : celle de la fiche, et celle où on la range. */
class TwoFamilies extends CategoryRepository {
  findById(id: string): Promise<Category | null> {
    if (id !== "cat_tartes" && id !== "cat_gateaux") {
      return Promise.resolve(null);
    }
    return Promise.resolve(
      Category.reconstitute({
        id,
        name: { fr: FAMILY_NAMES[id] ?? id },
        slug: { fr: id },
        parentId: null,
        position: 0,
        isArchived: false,
        channelPreset: [],
        vatByContext: {},
      }),
    );
  }
  findBySlugFr(): Promise<Category | null> {
    return Promise.resolve(null);
  }
  listAll(): Promise<Category[]> {
    return Promise.resolve([]);
  }
  listChildren(): Promise<Category[]> {
    return Promise.resolve([]);
  }
  add(): Promise<void> {
    return Promise.resolve();
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
  saveAll(): Promise<void> {
    return Promise.resolve();
  }
  countActiveChildren(): Promise<number> {
    return Promise.resolve(0);
  }
  nextPosition(): Promise<number> {
    return Promise.resolve(0);
  }
}

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
    this.current = product.snapshot();
    return Promise.resolve();
  }
}

function tart(): OneProduct {
  return new OneProduct({
    id: "prd_1",
    sku: "TAR-1",
    name: { fr: "Tarte" },
    slug: { fr: "tarte" },
    kind: "daily",
    categoryId: "cat_tartes",
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
        regulatoryFollowsDefault: false,
        pricingFollowsDefault: false,
        allergens: null,
        nutrition: null,
      },
    ],
    vatByContext: {},
    channelOverride: null,
  });
}

async function saveIdentity(
  products: OneProduct,
  journal: RecordingJournal,
  nameFr: string,
  categoryId: string,
): Promise<void> {
  await new UpdateProductIdentityHandler(
    products,
    new TwoFamilies(),
    journal,
    new DirectUnitOfWork(),
  ).execute(
    new UpdateProductIdentityCommand("prd_1", { name: { fr: nameFr }, kind: "daily", categoryId }),
  );
}

describe("UpdateProductIdentityHandler — le reclassement", () => {
  it("écrit `product.reclassified` quand la fiche change de famille", async () => {
    const products = tart();
    const journal = new RecordingJournal();

    await saveIdentity(products, journal, "Tarte", "cat_gateaux");

    expect(products.stored.categoryId).toBe("cat_gateaux");
    expect(journal.types()).toEqual(["product.identity_saved", "product.reclassified"]);
    // Les deux familles NOMMÉES, sous leur nom de ce jour-là (plan des
    // phrases du journal, D5), et la fiche sous le sien (D6).
    expect(journal.entries[1]).toMatchObject({
      subjectType: "product",
      subjectId: "prd_1",
      payload: {
        subjectLabel: "Tarte",
        from: { id: "cat_tartes", name: "Tartes" },
        to: { id: "cat_gateaux", name: "Gâteaux" },
      },
    });
    // Le diff d'identité garde sa famille sous la clé `categoryId` : c'est un
    // champ de révision, que l'attribution lit là.
    expect(journal.entries[0]?.payload["changes"]).toMatchObject({
      categoryId: {
        from: { id: "cat_tartes", name: "Tartes" },
        to: { id: "cat_gateaux", name: "Gâteaux" },
      },
    });
  });

  it("ne l'écrit pas quand on renomme la fiche sans la reclasser", async () => {
    const products = tart();
    const journal = new RecordingJournal();

    await saveIdentity(products, journal, "Tarte aux pommes", "cat_tartes");

    expect(journal.types()).toEqual(["product.identity_saved"]);
  });

  it("n'écrit rien quand la section est réenregistrée à l'identique", async () => {
    const products = tart();
    const journal = new RecordingJournal();

    await saveIdentity(products, journal, "Tarte", "cat_tartes");

    expect(journal.types()).toEqual([]);
  });
});
