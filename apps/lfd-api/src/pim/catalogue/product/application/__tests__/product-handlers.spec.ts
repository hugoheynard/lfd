import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import {
  AllergenStore,
  InMemoryAllergenCatalogueReader,
} from "../../../../allergens/application/__tests__/in-memory-allergens.js";
import { ArchivedAllergenDeclaredError } from "../../../../allergens/domain/errors/allergen-errors.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import {
  ArchivedProductNotWithdrawableError,
  NotArchivedProductNotRestorableError,
  ProductNotFoundError,
  VariantNotFoundError,
} from "../../domain/errors/product-errors.js";
import {
  CategoryArchivedError,
  CategoryNotFoundError,
} from "../../../category/domain/errors/category-errors.js";
import { Category } from "../../../category/domain/entities/category.js";
import { CategoryRepository } from "../../../category/domain/ports/category.repository.js";
import type { SalesChannels } from "../../../shared/domain/value-objects/sales-channels.js";
import {
  EditorialReader,
  type ProductEditorialView,
  type ProductMediaRecord,
} from "../../domain/ports/editorial-reader.js";
import { EditorialRepository } from "../../domain/ports/editorial.repository.js";
import { SetProductMediaCommand, SetProductMediaHandler } from "../set-product-media.js";
import { NutritionRepository } from "../../domain/ports/nutrition.repository.js";
import { Product, type ProductSnapshot } from "../../domain/entities/product.js";
import { ProductRepository } from "../../domain/ports/product.repository.js";
import type { Editorial, MediaItem } from "../../domain/value-objects/editorial.js";
import type { NutritionDeclaration } from "../../domain/value-objects/nutrition-declaration.js";
import { ArchiveProductHandler } from "../archive-product.js";
import { ArchiveProductCommand } from "../archive-product.js";
import { DeclareProductNutritionHandler } from "../declare-product-nutrition.js";
import { DeclareProductNutritionCommand } from "../declare-product-nutrition.js";
import { ProductNotPublishableError } from "../../domain/errors/product-errors.js";
import { PublishProductCommand, PublishProductHandler } from "../publish-product.js";
import { RestoreProductHandler } from "../restore-product.js";
import { UnpublishProductCommand, UnpublishProductHandler } from "../unpublish-product.js";
import { RestoreProductCommand } from "../restore-product.js";
import { UpdateProductEditorialHandler } from "../update-product-editorial.js";
import { UpdateProductEditorialCommand } from "../update-product-editorial.js";
import { UpdateProductIdentityHandler } from "../update-product-identity.js";
import { UpdateProductIdentityCommand } from "../update-product-identity.js";
import { UpdateVariantPricingHandler } from "../update-variant-pricing.js";
import { UpdateVariantPricingCommand } from "../update-variant-pricing.js";

const PRODUCT_ID = "prd_1";
const VARIANT_ID = "prd_1_v1";

function seedProduct(): ProductSnapshot {
  return {
    id: PRODUCT_ID,
    sku: "CAFE-1",
    name: { fr: "Café" },
    slug: { fr: "cafe" },
    kind: "resale",
    categoryId: "cat_active",
    status: "draft",
    vatByContext: {},
    channelOverride: null,
    variants: [
      {
        id: VARIANT_ID,
        sku: "CAFE-1-1",
        name: { fr: "Café" },
        options: {},
        isDefault: true,
        isDiscontinued: false,
        position: 0,
        priceCents: null,
        weightGrams: null,
        regulatoryFollowsDefault: false,
        allergens: null,
        nutrition: null,
      },
    ],
  };
}

/**
 * Garde un instantané et **reconstitue** à chaque lecture : un test ne doit
 * pas passer parce qu'il tient la même instance que le handler — ce que la
 * vraie base ne fera jamais.
 */
class FakeProductRepository extends ProductRepository {
  constructor(private stored: ProductSnapshot | null) {
    super();
  }

  findById(id: string): Promise<Product | null> {
    const found = this.stored !== null && this.stored.id === id ? this.stored : null;
    return Promise.resolve(found === null ? null : Product.reconstitute(found));
  }
  listAll(): Promise<Product[]> {
    return Promise.resolve(this.stored === null ? [] : [Product.reconstitute(this.stored)]);
  }
  add(product: Product): Promise<void> {
    return this.save(product);
  }
  save(product: Product): Promise<void> {
    this.stored = product.snapshot();
    return Promise.resolve();
  }

  snapshot(): ProductSnapshot | null {
    return this.stored;
  }
}

/** Rien de vendu. Les emplacements sont une DONNÉE : la carte est vide, elle
 *  ne porte pas deux boutiques codées en dur à zéro. */
const NO_CHANNELS: SalesChannels = [];

class FakeCategoryRepository extends CategoryRepository {
  /** Deux familles suffisent aux verbes produit : une vivante, une archivée. */
  private static family(id: string, name: string, isArchived: boolean): Category {
    return Category.reconstitute({
      id,
      name: { fr: name },
      slug: { fr: name.toLowerCase() },
      parentId: null,
      position: 0,
      isArchived,
      channelPreset: NO_CHANNELS,
      vatByContext: {},
    });
  }

  findById(id: string): Promise<Category | null> {
    if (id === "cat_active") {
      return Promise.resolve(FakeCategoryRepository.family(id, "Boissons", false));
    }
    if (id === "cat_archived") {
      return Promise.resolve(FakeCategoryRepository.family(id, "Ancien", true));
    }
    return Promise.resolve(null);
  }
  listAll(): Promise<Category[]> {
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
  findBySlugFr(): Promise<Category | null> {
    return Promise.resolve(null);
  }
  listChildren(): Promise<Category[]> {
    return Promise.resolve([]);
  }
  countActiveChildren(): Promise<number> {
    return Promise.resolve(0);
  }
  nextPosition(): Promise<number> {
    return Promise.resolve(0);
  }
}

class RecordingNutritionRepository extends NutritionRepository {
  readonly calls: { variantId: string; declaration: NutritionDeclaration }[] = [];
  declare(variantId: string, declaration: NutritionDeclaration): Promise<void> {
    this.calls.push({ variantId, declaration });
    return Promise.resolve();
  }
}

class RecordingEditorialRepository extends EditorialRepository {
  readonly calls: {
    productId: string;
    editorial: Editorial;
    media: readonly MediaItem[];
  }[] = [];
  save(productId: string, editorial: Editorial, media: readonly MediaItem[]): Promise<void> {
    this.calls.push({ productId, editorial, media });
    return Promise.resolve();
  }

  readonly replaced: { productId: string; media: readonly MediaItem[] }[] = [];
  replaceMedia(productId: string, media: readonly MediaItem[]): Promise<void> {
    this.replaced.push({ productId, media });
    return Promise.resolve();
  }
}

/**
 * Ce que l'historique d'une fiche promet.
 *
 * Deux propriétés se cassent en silence : un diff qui rate le champ modifié
 * (l'historique existe, il ment) et un fait écrit alors que rien n'a bougé
 * (l'historique se remplit de gestes sans effet, et on cesse de le lire).
 */
/**
 * Lecteur doublé : la fiche part **vierge**, ce qui est le cas courant — un
 * produit neuf n'a ni texte ni visuel. Le diff porte donc sur « rien → quelque
 * chose », qui est précisément la première trace qu'on veut voir.
 */
class EmptyEditorialReader extends EditorialReader {
  findByProduct(): Promise<ProductEditorialView | null> {
    return Promise.resolve(null);
  }
  findByProducts(): Promise<ReadonlyMap<string, ProductEditorialView>> {
    return Promise.resolve(new Map());
  }
  mediaOf(): Promise<readonly ProductMediaRecord[]> {
    return Promise.resolve([]);
  }
}

describe("l’historique d’une fiche", () => {
  it("écrit ce qui a changé, en AVANT → APRÈS", async () => {
    const products = new FakeProductRepository(seedProduct());
    const journal = new RecordingJournal();

    await new UpdateProductIdentityHandler(
      products,
      new FakeCategoryRepository(),
      journal,
      new DirectUnitOfWork(),
    ).execute(
      new UpdateProductIdentityCommand(PRODUCT_ID, {
        name: { fr: "Moka" },
        kind: "daily",
        categoryId: "cat_active",
      }),
    );

    expect(journal.types()).toEqual(["product.identity_saved"]);
    const changes = journal.entries[0]?.payload["changes"];
    expect(changes).toMatchObject({ name: { to: { fr: "Moka" } } });
  });

  it("n’écrit RIEN quand la section est enregistrée sans modification", async () => {
    const products = new FakeProductRepository(seedProduct());
    const journal = new RecordingJournal();
    const before = products.snapshot();

    await new UpdateProductIdentityHandler(
      products,
      new FakeCategoryRepository(),
      journal,
      new DirectUnitOfWork(),
    ).execute(
      new UpdateProductIdentityCommand(PRODUCT_ID, {
        name: before?.name ?? { fr: "" },
        kind: before?.kind ?? "daily",
        categoryId: before?.categoryId ?? "cat_active",
      }),
    );

    expect(journal.entries).toEqual([]);
  });

  it("nomme la DÉCLINAISON dans la charge, pas dans le sujet", async () => {
    // L'historique se lit par fiche : un sujet « variante » le couperait en
    // autant de fils qu'il y a de déclinaisons.
    const products = new FakeProductRepository(seedProduct());
    const journal = new RecordingJournal();

    await new UpdateVariantPricingHandler(products, journal, new DirectUnitOfWork()).execute(
      new UpdateVariantPricingCommand(PRODUCT_ID, VARIANT_ID, {
        priceCents: 260,
        weightGrams: null,
      }),
    );

    const entry = journal.entries[0];
    expect(entry?.subjectType).toBe("product");
    expect(entry?.subjectId).toBe(PRODUCT_ID);
    expect(entry?.payload["variantId"]).toBe(VARIANT_ID);
  });
});

describe("UpdateProductIdentityHandler", () => {
  it("met à jour nom + nature + famille en une opération", async () => {
    const products = new FakeProductRepository(seedProduct());
    await new UpdateProductIdentityHandler(
      products,
      new FakeCategoryRepository(),
      new RecordingJournal(),
      new DirectUnitOfWork(),
    ).execute(
      new UpdateProductIdentityCommand(PRODUCT_ID, {
        name: { fr: "Moka" },
        kind: "daily",
        categoryId: "cat_active",
      }),
    );
    const snapshot = products.snapshot();
    expect(snapshot?.name.fr).toBe("Moka");
    expect(snapshot?.kind).toBe("daily");
    expect(snapshot?.categoryId).toBe("cat_active");
  });

  it("refuse une famille archivée (rien n’est écrit)", async () => {
    const products = new FakeProductRepository(seedProduct());
    await expect(
      new UpdateProductIdentityHandler(
        products,
        new FakeCategoryRepository(),
        new RecordingJournal(),
        new DirectUnitOfWork(),
      ).execute(
        new UpdateProductIdentityCommand(PRODUCT_ID, {
          name: { fr: "Moka" },
          kind: "daily",
          categoryId: "cat_archived",
        }),
      ),
    ).rejects.toBeInstanceOf(CategoryArchivedError);
    expect(products.snapshot()?.name.fr).toBe("Café");
  });

  it("refuse une famille inconnue", async () => {
    const products = new FakeProductRepository(seedProduct());
    await expect(
      new UpdateProductIdentityHandler(
        products,
        new FakeCategoryRepository(),
        new RecordingJournal(),
        new DirectUnitOfWork(),
      ).execute(
        new UpdateProductIdentityCommand(PRODUCT_ID, {
          name: { fr: "Moka" },
          kind: "daily",
          categoryId: "cat_absent",
        }),
      ),
    ).rejects.toBeInstanceOf(CategoryNotFoundError);
  });

  it("refuse un produit inconnu", async () => {
    const products = new FakeProductRepository(seedProduct());
    await expect(
      new UpdateProductIdentityHandler(
        products,
        new FakeCategoryRepository(),
        new RecordingJournal(),
        new DirectUnitOfWork(),
      ).execute(
        new UpdateProductIdentityCommand("prd_absent", {
          name: { fr: "X" },
          kind: "daily",
          categoryId: "cat_active",
        }),
      ),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
  });
});

describe("UpdateVariantPricingHandler", () => {
  it("met à jour tarif + poids en une opération", async () => {
    const products = new FakeProductRepository(seedProduct());
    await new UpdateVariantPricingHandler(
      products,
      new RecordingJournal(),
      new DirectUnitOfWork(),
    ).execute(
      new UpdateVariantPricingCommand(PRODUCT_ID, VARIANT_ID, {
        priceCents: 500,
        weightGrams: 300,
      }),
    );
    expect(products.snapshot()?.variants[0]?.priceCents).toBe(500);
    expect(products.snapshot()?.variants[0]?.weightGrams).toBe(300);
  });

  it("dé-tarife avec null", async () => {
    const seeded = seedProduct();
    const [variant] = seeded.variants;
    if (variant === undefined) {
      throw new Error("le produit de test doit porter une déclinaison");
    }
    const products = new FakeProductRepository({
      ...seeded,
      variants: [{ ...variant, priceCents: 999 }],
    });
    await new UpdateVariantPricingHandler(
      products,
      new RecordingJournal(),
      new DirectUnitOfWork(),
    ).execute(
      new UpdateVariantPricingCommand(PRODUCT_ID, VARIANT_ID, {
        priceCents: null,
        weightGrams: null,
      }),
    );
    expect(products.snapshot()?.variants[0]?.priceCents).toBeNull();
  });

  it("refuse une déclinaison d’un autre produit", async () => {
    const products = new FakeProductRepository(seedProduct());
    await expect(
      new UpdateVariantPricingHandler(
        products,
        new RecordingJournal(),
        new DirectUnitOfWork(),
      ).execute(
        new UpdateVariantPricingCommand(PRODUCT_ID, "variant_etranger", {
          priceCents: 100,
          weightGrams: null,
        }),
      ),
    ).rejects.toBeInstanceOf(VariantNotFoundError);
  });
});

describe("UpdateProductEditorialHandler", () => {
  it("met à jour l’éditorial sans toucher aux médias (liste vide)", async () => {
    const products = new FakeProductRepository(seedProduct());
    const editorials = new RecordingEditorialRepository();
    await new UpdateProductEditorialHandler(
      products,
      editorials,
      new EmptyEditorialReader(),
      new RecordingJournal(),
      new DirectUnitOfWork(),
    ).execute(
      new UpdateProductEditorialCommand(PRODUCT_ID, {
        descriptionShort: { fr: "Torréfaction douce" },
      }),
    );
    expect(editorials.calls).toHaveLength(1);
    expect(editorials.calls[0]?.media).toEqual([]);
    expect(editorials.calls[0]?.editorial.descriptionShort).toEqual({
      fr: "Torréfaction douce",
    });
  });
});

/**
 * Le référentiel servi depuis la base (D3) : `GB` (orge) est officiel et
 * proposé, `OLD` est une entrée maison **archivée** — encore reconnue, plus
 * jamais offerte.
 */
function reference(): InMemoryAllergenCatalogueReader {
  const store = new AllergenStore();
  store.seedOfficialCategory("alg_cat_gluten", "gluten", "gluten");
  store.seedOfficialEntry("alg_GB", "GB", "alg_cat_gluten");
  store.seedHouseEntry("alg_OLD", "OLD", "alg_cat_gluten", new Date());
  return new InMemoryAllergenCatalogueReader(store);
}

function declareHandler(
  products: FakeProductRepository,
  nutrition: RecordingNutritionRepository,
): DeclareProductNutritionHandler {
  return new DeclareProductNutritionHandler(
    products,
    nutrition,
    reference(),
    new RecordingJournal(),
    new DirectUnitOfWork(),
  );
}

describe("DeclareProductNutritionHandler", () => {
  it("déclare la fiche réglementaire de la déclinaison", async () => {
    const products = new FakeProductRepository(seedProduct());
    const nutrition = new RecordingNutritionRepository();
    await declareHandler(products, nutrition).execute(
      new DeclareProductNutritionCommand(PRODUCT_ID, VARIANT_ID, {
        allergens: ["GB"],
      }),
    );
    expect(nutrition.calls).toHaveLength(1);
    expect(nutrition.calls[0]?.variantId).toBe(VARIANT_ID);
  });

  it("refuse une déclaration sur une déclinaison étrangère", async () => {
    const products = new FakeProductRepository(seedProduct());
    await expect(
      declareHandler(products, new RecordingNutritionRepository()).execute(
        new DeclareProductNutritionCommand(PRODUCT_ID, "variant_etranger", {
          allergens: [],
        }),
      ),
    ).rejects.toBeInstanceOf(VariantNotFoundError);
  });
});

/**
 * **D2 bis, le revers.** L'archivage retire un allergène de ce qu'on PROPOSE,
 * pas de ce qu'on reconnaît. Comme cette commande revalide la déclaration
 * ENTIÈRE à chaque enregistrement, un refus sec ferait échouer un changement de
 * valeur nutritionnelle sur un code que personne n'a touché — d'où la
 * distinction entre rééditer et ajouter.
 */
describe("DeclareProductNutritionHandler — un code archivé", () => {
  /** La fiche cite déjà `OLD` : elle a été enregistrée avant l'archivage. */
  function alreadyCiting(
    codes: readonly string[],
    traces: readonly string[] = [],
  ): ProductSnapshot {
    const seed = seedProduct();
    const [variant] = seed.variants;
    return {
      ...seed,
      variants: [
        {
          ...variant!,
          allergens: [...codes],
          nutrition: {
            mayContain: [...traces],
            energyKcal: null,
            fatG: null,
            saturatedFatG: null,
            carbsG: null,
            sugarsG: null,
            proteinG: null,
            saltG: null,
            glycemicIndex: null,
          },
        },
      ],
    };
  }

  it("refuse de l'AJOUTER à une fiche qui ne le citait pas", async () => {
    const products = new FakeProductRepository(seedProduct());
    const nutrition = new RecordingNutritionRepository();

    await expect(
      declareHandler(products, nutrition).execute(
        new DeclareProductNutritionCommand(PRODUCT_ID, VARIANT_ID, { allergens: ["GB", "OLD"] }),
      ),
    ).rejects.toBeInstanceOf(ArchivedAllergenDeclaredError);
    expect(nutrition.calls).toHaveLength(0);
  });

  it("laisse RÉENREGISTRER une fiche qui le citait déjà", async () => {
    const products = new FakeProductRepository(alreadyCiting(["OLD"]));
    const nutrition = new RecordingNutritionRepository();

    await declareHandler(products, nutrition).execute(
      // Seule la valeur nutritionnelle change ; l'allergène archivé traverse.
      new DeclareProductNutritionCommand(PRODUCT_ID, VARIANT_ID, {
        allergens: ["OLD"],
        nutrition: { saltG: 2 },
      }),
    );

    expect(nutrition.calls[0]?.declaration.allergens).toEqual(["OLD"]);
  });

  it("compte aussi les TRACES dans ce qui était déjà déclaré", async () => {
    const products = new FakeProductRepository(alreadyCiting([], ["OLD"]));
    const nutrition = new RecordingNutritionRepository();

    await declareHandler(products, nutrition).execute(
      new DeclareProductNutritionCommand(PRODUCT_ID, VARIANT_ID, {
        allergens: [],
        mayContain: ["OLD"],
      }),
    );

    expect(nutrition.calls[0]?.declaration.mayContain).toEqual(["OLD"]);
  });
});

describe("Archive / Restore product", () => {
  it("archive puis restaure le produit", async () => {
    const products = new FakeProductRepository(seedProduct());

    await new ArchiveProductHandler(
      products,
      new RecordingJournal(),
      new DirectUnitOfWork(),
    ).execute(new ArchiveProductCommand(PRODUCT_ID));
    expect(products.snapshot()?.status).toBe("archived");

    await new RestoreProductHandler(
      products,
      new RecordingJournal(),
      new DirectUnitOfWork(),
    ).execute(new RestoreProductCommand(PRODUCT_ID));
    expect(products.snapshot()?.status).toBe("draft");
  });

  it("refuse d’archiver un produit inconnu", async () => {
    const products = new FakeProductRepository(seedProduct());
    await expect(
      new ArchiveProductHandler(products, new RecordingJournal(), new DirectUnitOfWork()).execute(
        new ArchiveProductCommand("prd_absent"),
      ),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
  });
});

describe("PublishProductHandler", () => {
  it("refuse un produit dont la déclinaison n’a pas de fiche réglementaire", async () => {
    const repo = new FakeProductRepository(seedProduct());

    await expect(
      new PublishProductHandler(repo, new RecordingJournal(), new DirectUnitOfWork()).execute(
        new PublishProductCommand(PRODUCT_ID),
      ),
    ).rejects.toBeInstanceOf(ProductNotPublishableError);
    expect(repo.snapshot()?.status).toBe("draft");
  });

  it("publie un produit étiqueté", async () => {
    const seeded = seedProduct();
    const [variant] = seeded.variants;
    const repo = new FakeProductRepository({
      ...seeded,
      variants: [{ ...variant!, allergens: ["gluten"] }],
    });

    await new PublishProductHandler(repo, new RecordingJournal(), new DirectUnitOfWork()).execute(
      new PublishProductCommand(PRODUCT_ID),
    );

    expect(repo.snapshot()?.status).toBe("published");
  });

  it("jette si le produit n’existe pas", async () => {
    await expect(
      new PublishProductHandler(
        new FakeProductRepository(null),
        new RecordingJournal(),
        new DirectUnitOfWork(),
      ).execute(new PublishProductCommand(PRODUCT_ID)),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
  });
});

describe("UnpublishProductHandler", () => {
  it("ramène un produit publié en brouillon", async () => {
    const seeded = seedProduct();
    const [variant] = seeded.variants;
    const repo = new FakeProductRepository({
      ...seeded,
      status: "published",
      variants: [{ ...variant!, allergens: [] }],
    });

    await new UnpublishProductHandler(repo, new RecordingJournal(), new DirectUnitOfWork()).execute(
      new UnpublishProductCommand(PRODUCT_ID),
    );

    expect(repo.snapshot()?.status).toBe("draft");
  });

  /**
   * Régression : le handler traçait `product.unpublished` — portée comprise,
   * « N articles cessent d'être vendus » — avant même de savoir si l'agrégat
   * avait changé d'état. Le journal est la trace d'audit ; un retrait de la
   * vente qui n'a pas eu lieu y est un fait faux (audit 2026-09-01, §1).
   */
  it("n’inscrit RIEN au journal quand la fiche était déjà en brouillon", async () => {
    const repo = new FakeProductRepository(seedProduct());
    const journal = new RecordingJournal();

    await new UnpublishProductHandler(repo, journal, new DirectUnitOfWork()).execute(
      new UnpublishProductCommand(PRODUCT_ID),
    );

    expect(journal.types()).toEqual([]);
    expect(repo.snapshot()?.status).toBe("draft");
  });

  /**
   * C'est par ici que passait la RESTAURATION du back-office. Le refus est la
   * seule chose qui rendait la panne visible.
   */
  it("refuse un produit archivé plutôt que de faire semblant", async () => {
    const repo = new FakeProductRepository({ ...seedProduct(), status: "archived" });
    const journal = new RecordingJournal();

    await expect(
      new UnpublishProductHandler(repo, journal, new DirectUnitOfWork()).execute(
        new UnpublishProductCommand(PRODUCT_ID),
      ),
    ).rejects.toBeInstanceOf(ArchivedProductNotWithdrawableError);

    expect(journal.types()).toEqual([]);
    expect(repo.snapshot()?.status).toBe("archived");
  });
});

describe("SetProductMediaHandler", () => {
  it("remplace la liste, et tire la position du RANG reçu", async () => {
    const products = new FakeProductRepository(seedProduct());
    const editorials = new RecordingEditorialRepository();

    await new SetProductMediaHandler(
      products,
      editorials,
      new EmptyEditorialReader(),
      new RecordingJournal(),
      new DirectUnitOfWork(),
    ).execute(
      new SetProductMediaCommand(PRODUCT_ID, [
        { role: "hero", url: "https://cdn/1.jpg", alt: { fr: "De face" } },
        { role: "gallery", url: "https://cdn/2.jpg" },
      ]),
    );

    expect(editorials.replaced).toHaveLength(1);
    // La position ne vient pas d'un champ : deux images ne peuvent donc pas
    // revendiquer la même place, et l'ordre affiché est l'ordre enregistré.
    expect(editorials.replaced[0]?.media.map((item) => [item.role, item.position])).toEqual([
      ["hero", 0],
      ["gallery", 1],
    ]);
    // La couche éditoriale n'est PAS touchée : les textes ne partent pas avec.
    expect(editorials.calls).toEqual([]);
  });

  it("accepte une liste vide — retirer le dernier visuel est un geste légitime", async () => {
    const products = new FakeProductRepository(seedProduct());
    const editorials = new RecordingEditorialRepository();

    await new SetProductMediaHandler(
      products,
      editorials,
      new EmptyEditorialReader(),
      new RecordingJournal(),
      new DirectUnitOfWork(),
    ).execute(new SetProductMediaCommand(PRODUCT_ID, []));

    expect(editorials.replaced[0]?.media).toEqual([]);
  });
});

describe("Ce que l’archivage d’une fiche inscrit au journal", () => {
  /**
   * `archived` / `restored` ne doublonnent pas `unpublished` / `published` :
   * dépublier retire de la vente une fiche qu'on continue de travailler,
   * archiver la retire du référentiel. C'est la question qu'on posera au
   * journal six mois plus tard, et deux faits distincts pour y répondre.
   */
  it("nomme deux faits distincts pour l’archivage et la restauration", async () => {
    const products = new FakeProductRepository(seedProduct());
    const journal = new RecordingJournal();
    const uow = new DirectUnitOfWork();

    await new ArchiveProductHandler(products, journal, uow).execute(
      new ArchiveProductCommand(PRODUCT_ID),
    );
    await new RestoreProductHandler(products, journal, uow).execute(
      new RestoreProductCommand(PRODUCT_ID),
    );

    expect(journal.types()).toEqual(["product.archived", "product.restored"]);
  });

  /**
   * L'archivage en lot passe par ce handler, et une sélection contient
   * couramment ce qui est déjà archivé. Il reste donc idempotent — mais un
   * second passage n'inscrit pas une seconde sortie de catalogue.
   */
  it("n’inscrit rien la seconde fois : archiver deux fois n’est pas archiver deux fois", async () => {
    const products = new FakeProductRepository(seedProduct());
    const journal = new RecordingJournal();
    const uow = new DirectUnitOfWork();

    await new ArchiveProductHandler(products, journal, uow).execute(
      new ArchiveProductCommand(PRODUCT_ID),
    );
    await new ArchiveProductHandler(products, journal, uow).execute(
      new ArchiveProductCommand(PRODUCT_ID),
    );

    expect(journal.types()).toEqual(["product.archived"]);
  });

  /** Restaurer ce qui n'est pas archivé rétrogradait un produit en ligne. */
  it("refuse de restaurer un produit qui n’est pas archivé", async () => {
    const products = new FakeProductRepository(seedProduct());
    const journal = new RecordingJournal();

    await expect(
      new RestoreProductHandler(products, journal, new DirectUnitOfWork()).execute(
        new RestoreProductCommand(PRODUCT_ID),
      ),
    ).rejects.toBeInstanceOf(NotArchivedProductNotRestorableError);

    expect(journal.types()).toEqual([]);
  });

  it("emporte la référence et le nom — une fiche archivée sort des écrans", async () => {
    const products = new FakeProductRepository(seedProduct());
    const journal = new RecordingJournal();

    await new ArchiveProductHandler(products, journal, new DirectUnitOfWork()).execute(
      new ArchiveProductCommand(PRODUCT_ID),
    );

    expect(journal.entries[0]?.payload).toHaveProperty("sku");
    expect(journal.entries[0]?.payload).toHaveProperty("name");
  });
});
