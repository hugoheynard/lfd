import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import {
  AllergenStore,
  InMemoryAllergenCatalogueReader,
} from "../../../../allergens/application/__tests__/in-memory-allergens.js";
import { ArchivedAllergenDeclaredError } from "../../../../allergens/domain/errors/allergen-errors.js";
import { NutritionPartExceedsWholeError } from "../../domain/value-objects/nutrition-declaration.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
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
import { NutritionValuesRepository } from "../../domain/ports/nutrition-values.repository.js";
import { VariantAllergensRepository } from "../../domain/ports/variant-allergens.repository.js";
import { Product, type ProductSnapshot } from "../../domain/entities/product.js";
import { ProductRepository } from "../../domain/ports/product.repository.js";
import type { Editorial, MediaItem } from "../../domain/value-objects/editorial.js";
import type {
  AllergenDeclaration,
  NutritionValues,
} from "../../domain/value-objects/nutrition-declaration.js";
import { ArchiveProductHandler } from "../archive-product.js";
import { ArchiveProductCommand } from "../archive-product.js";
import { SaveVariantAllergensHandler } from "../save-variant-allergens.js";
import { SaveVariantAllergensCommand } from "../save-variant-allergens.js";
import { SaveVariantNutritionHandler } from "../save-variant-nutrition.js";
import { SaveVariantNutritionCommand } from "../save-variant-nutrition.js";
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
    operationOnly: false,
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
        nutritionFollowsDefault: false,
        pricingFollowsDefault: false,
        allergenSheet: null,
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
    // L'instantané NON résolu, exactement comme l'adaptateur Prisma. `snapshot()`
    // résout l'héritage : l'écrire ici recopierait la fiche et le tarif du défaut
    // dans les colonnes PROPRES d'une déclinaison alignée — la faute 0b/0d du plan
    // `plan-separer-allergenes-et-nutrition.md`, rejouée par le double, qui rendait
    // vert ce que la vraie base refuse de faire (constaté le 2026-09-22).
    this.stored = product.persistenceSnapshot();
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

class RecordingAllergensRepository extends VariantAllergensRepository {
  readonly calls: { variantId: string; declaration: AllergenDeclaration }[] = [];
  save(variantId: string, declaration: AllergenDeclaration): Promise<void> {
    this.calls.push({ variantId, declaration });
    return Promise.resolve();
  }
}

class RecordingNutritionRepository extends NutritionValuesRepository {
  readonly calls: { variantId: string; values: NutritionValues }[] = [];
  save(variantId: string, values: NutritionValues): Promise<void> {
    this.calls.push({ variantId, values });
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
  mediaOfProducts(): Promise<ReadonlyMap<string, readonly ProductMediaRecord[]>> {
    return Promise.resolve(new Map());
  }
}

/** Une ligne de visuel telle que la base la rend : mesures comprises, et
 *  toujours `null` ici — elles décrivent le fichier, pas la décision. */
function mediaRow(role: string, url: string): ProductMediaRecord {
  return {
    role,
    url,
    name: "Face",
    alt: { fr: "De face" },
    width: null,
    height: null,
    bytes: null,
    contentType: null,
  };
}

/** Lecteur doublé d'une fiche qui porte DÉJÀ des visuels : sans état d'avant,
 *  aucun diff ne peut rater un champ. */
class StoredMediaReader extends EmptyEditorialReader {
  constructor(private readonly stored: readonly ProductMediaRecord[]) {
    super();
  }
  override mediaOf(): Promise<readonly ProductMediaRecord[]> {
    return Promise.resolve(this.stored);
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
    // …et la nomme : l'identifiant ET son nom du moment (plan des phrases, D5).
    expect(entry?.payload["variant"]).toEqual({ id: VARIANT_ID, name: "Café" });
    expect(entry?.payload["subjectLabel"]).toBe("Café");
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

function allergensHandler(
  products: FakeProductRepository,
  allergens: RecordingAllergensRepository,
): SaveVariantAllergensHandler {
  return new SaveVariantAllergensHandler(
    products,
    allergens,
    reference(),
    new RecordingJournal(),
    new DirectUnitOfWork(),
  );
}

function nutritionHandler(
  products: FakeProductRepository,
  values: RecordingNutritionRepository,
): SaveVariantNutritionHandler {
  return new SaveVariantNutritionHandler(
    products,
    values,
    new RecordingJournal(),
    new DirectUnitOfWork(),
  );
}

describe("SaveVariantAllergensHandler", () => {
  it("déclare les allergènes de la déclinaison", async () => {
    const products = new FakeProductRepository(seedProduct());
    const allergens = new RecordingAllergensRepository();

    await allergensHandler(products, allergens).execute(
      new SaveVariantAllergensCommand(PRODUCT_ID, VARIANT_ID, { allergens: ["GB"] }),
    );

    expect(allergens.calls).toHaveLength(1);
    expect(allergens.calls[0]?.variantId).toBe(VARIANT_ID);
    expect(allergens.calls[0]?.declaration).toEqual({ allergens: ["GB"], mayContain: [] });
  });

  it("refuse une déclaration sur une déclinaison étrangère", async () => {
    const products = new FakeProductRepository(seedProduct());

    await expect(
      allergensHandler(products, new RecordingAllergensRepository()).execute(
        new SaveVariantAllergensCommand(PRODUCT_ID, "variant_etranger", { allergens: [] }),
      ),
    ).rejects.toBeInstanceOf(VariantNotFoundError);
  });

  /**
   * 🔴 **Ce pour quoi le chantier existe.** Enregistrer les allergènes n'écrit
   * pas une valeur nutritionnelle — il ne peut donc plus effacer un tableau que
   * personne n'a rouvert (plan `plan-separer-allergenes-et-nutrition.md`, §1).
   */
  it("n'écrit AUCUNE valeur nutritionnelle", async () => {
    const products = new FakeProductRepository(seedProduct());
    const values = new RecordingNutritionRepository();

    await allergensHandler(products, new RecordingAllergensRepository()).execute(
      new SaveVariantAllergensCommand(PRODUCT_ID, VARIANT_ID, { allergens: ["GB"] }),
    );

    expect(values.calls).toEqual([]);
  });
});

describe("SaveVariantNutritionHandler", () => {
  it("enregistre les valeurs de la déclinaison", async () => {
    const products = new FakeProductRepository(seedProduct());
    const values = new RecordingNutritionRepository();

    await nutritionHandler(products, values).execute(
      new SaveVariantNutritionCommand(PRODUCT_ID, VARIANT_ID, { saltG: 2 }),
    );

    expect(values.calls).toHaveLength(1);
    expect(values.calls[0]).toEqual({ variantId: VARIANT_ID, values: { saltG: 2 } });
  });

  /**
   * 🔴 **L'autre moitié de la promesse.** Le bug 0c fabriquait « aucun
   * allergène » depuis l'écran normal : enregistrer la fiche sans rien cocher
   * écrivait une affirmation. Ici, la commande n'a même pas de port par lequel
   * la fabriquer.
   */
  it("n'écrit AUCUN allergène", async () => {
    const products = new FakeProductRepository(seedProduct());
    const allergens = new RecordingAllergensRepository();

    await nutritionHandler(products, new RecordingNutritionRepository()).execute(
      new SaveVariantNutritionCommand(PRODUCT_ID, VARIANT_ID, { saltG: 2 }),
    );

    expect(allergens.calls).toEqual([]);
  });

  it("refuse un « dont » qui dépasse sa ligne", async () => {
    const products = new FakeProductRepository(seedProduct());
    const values = new RecordingNutritionRepository();

    await expect(
      nutritionHandler(products, values).execute(
        new SaveVariantNutritionCommand(PRODUCT_ID, VARIANT_ID, { carbsG: 4, sugarsG: 12 }),
      ),
    ).rejects.toBeInstanceOf(NutritionPartExceedsWholeError);
    expect(values.calls).toEqual([]);
  });

  it("refuse une déclaration sur une déclinaison étrangère", async () => {
    const products = new FakeProductRepository(seedProduct());

    await expect(
      nutritionHandler(products, new RecordingNutritionRepository()).execute(
        new SaveVariantNutritionCommand(PRODUCT_ID, "variant_etranger", { saltG: 2 }),
      ),
    ).rejects.toBeInstanceOf(VariantNotFoundError);
  });
});

/**
 * **D2 bis, le revers.** L'archivage retire un allergène de ce qu'on PROPOSE,
 * pas de ce qu'on reconnaît. Comme cette commande revalide la déclaration
 * ENTIÈRE à chaque enregistrement, un refus sec ferait échouer le retrait d'un
 * autre code sur un code archivé que personne n'a touché — d'où la distinction
 * entre rééditer et ajouter.
 */
describe("SaveVariantAllergensHandler — un code archivé", () => {
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
          allergenSheet: { declared: [...codes], mayContain: [...traces] },
          nutrition: null,
        },
      ],
    };
  }

  it("refuse de l'AJOUTER à une fiche qui ne le citait pas", async () => {
    const products = new FakeProductRepository(seedProduct());
    const allergens = new RecordingAllergensRepository();

    await expect(
      allergensHandler(products, allergens).execute(
        new SaveVariantAllergensCommand(PRODUCT_ID, VARIANT_ID, { allergens: ["GB", "OLD"] }),
      ),
    ).rejects.toBeInstanceOf(ArchivedAllergenDeclaredError);
    expect(allergens.calls).toHaveLength(0);
  });

  it("laisse RÉENREGISTRER une fiche qui le citait déjà", async () => {
    const products = new FakeProductRepository(alreadyCiting(["OLD"]));
    const allergens = new RecordingAllergensRepository();

    await allergensHandler(products, allergens).execute(
      // Seule la trace change ; l'allergène archivé traverse.
      new SaveVariantAllergensCommand(PRODUCT_ID, VARIANT_ID, {
        allergens: ["OLD"],
        mayContain: ["GB"],
      }),
    );

    expect(allergens.calls[0]?.declaration.allergens).toEqual(["OLD"]);
  });

  it("compte aussi les TRACES dans ce qui était déjà déclaré", async () => {
    const products = new FakeProductRepository(alreadyCiting([], ["OLD"]));
    const allergens = new RecordingAllergensRepository();

    await allergensHandler(products, allergens).execute(
      new SaveVariantAllergensCommand(PRODUCT_ID, VARIANT_ID, {
        allergens: [],
        mayContain: ["OLD"],
      }),
    );

    expect(allergens.calls[0]?.declaration.mayContain).toEqual(["OLD"]);
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
      variants: [{ ...variant!, allergenSheet: { declared: ["gluten"], mayContain: [] } }],
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

/**
 * 🔴 **L'invariant 7 s'écrit sur les allergènes seuls** — lot 5 du plan
 * `plan-separer-allergenes-et-nutrition.md` (D2, D3).
 *
 * Vu du handler : ce qui décide d'un `409` est la moitié **allergènes** de la
 * fiche, jamais la moitié valeurs. Le règlement (UE) n° 1169/2011 trie
 * exactement comme ça — art. 9 §1 point c) obligatoire, point l) exempté par
 * l'art. 44 §1 comme par l'annexe V pt 19 — donc l'invariant cesse d'exiger ce
 * que le règlement n'exige pas. C'est un redressement, pas une dérogation.
 *
 * ⚠️ Les deux gestes d'écriture n'écrivent PAS dans le dépôt produit : ils ont
 * chacun leur port de table (§6a). L'état est donc semé ici tel que
 * l'adaptateur le recollerait à la lecture — et c'est l'e2e qui éprouve le
 * recollage lui-même, faute de join dans un double.
 */
describe("publier ne regarde que les allergènes", () => {
  function publishing(repo: FakeProductRepository): Promise<void> {
    return new PublishProductHandler(repo, new RecordingJournal(), new DirectUnitOfWork()).execute(
      new PublishProductCommand(PRODUCT_ID),
    );
  }

  /** L'état d'une déclinaison, moitié par moitié. */
  function variantWith(over: Partial<ProductSnapshot["variants"][number]>): FakeProductRepository {
    const seeded = seedProduct();
    const [variant] = seeded.variants;
    return new FakeProductRepository({ ...seeded, variants: [{ ...variant!, ...over }] });
  }

  /** Sept valeurs de l'annexe XV plus l'indice : seule l'énergie est saisie. */
  const ENERGY_ONLY = {
    energyKcal: 410,
    fatG: null,
    saturatedFatG: null,
    carbsG: null,
    sugarsG: null,
    proteinG: null,
    saltG: null,
    glycemicIndex: null,
  } as const;

  /**
   * 🔴 Cas 1. Des allergènes, aucune valeur — le cas NORMAL en boutique, celui
   * que l'ancienne règle refusait et qui laissait 92 fiches en brouillon.
   */
  it("publie des allergènes déclarés sans la moindre valeur nutritionnelle", async () => {
    const repo = variantWith({
      allergenSheet: { declared: ["UW"], mayContain: [] },
      nutrition: null,
    });

    await publishing(repo);

    expect(repo.snapshot()?.status).toBe("published");
  });

  /**
   * 🔴 Cas 2. Des valeurs, aucune déclaration — l'état nommé de D3. Le refus
   * doit NOMMER la référence : le back-office ne lit que ce message.
   */
  it("refuse des valeurs nutritionnelles sans déclaration d’allergène", async () => {
    const repo = variantWith({ allergenSheet: null, nutrition: ENERGY_ONLY });

    await expect(publishing(repo)).rejects.toBeInstanceOf(ProductNotPublishableError);
    await expect(publishing(repo)).rejects.toThrow("CAFE-1-1");
    expect(repo.snapshot()?.status).toBe("draft");
  });

  /** Et il dit le geste de sortie, pas seulement le refus. */
  it("nomme la section à ouvrir plutôt que de dire « non »", async () => {
    const repo = variantWith({ allergenSheet: null, nutrition: ENERGY_ONLY });

    await expect(publishing(repo)).rejects.toThrow(/Allergènes/);
  });
});

describe("UnpublishProductHandler", () => {
  it("ramène un produit publié en brouillon", async () => {
    const seeded = seedProduct();
    const [variant] = seeded.variants;
    const repo = new FakeProductRepository({
      ...seeded,
      status: "published",
      variants: [{ ...variant!, allergenSheet: { declared: [], mayContain: [] } }],
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
      new RecordingPublisher(),
      new DirectUnitOfWork(),
    ).execute(
      new SetProductMediaCommand(PRODUCT_ID, [
        { role: "hero", url: "https://cdn/1.jpg" },
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
      new RecordingPublisher(),
      new DirectUnitOfWork(),
    ).execute(new SetProductMediaCommand(PRODUCT_ID, []));

    expect(editorials.replaced[0]?.media).toEqual([]);
  });

  /**
   * Régression : `listOf` réduisait un visuel à `{ url, name, alt }`, sans son
   * RÔLE. Promouvoir une image de `gallery` à `hero` — « c'est ce visuel-là
   * qu'on affiche » — produisait donc un diff vide, aucun fait au journal, et
   * l'écriture passait sous « section enregistrée sans modification »
   * (constaté le 2026-09-23).
   */
  it("journalise la PROMOTION d’un visuel en hero, qui ne change que son rôle", async () => {
    const products = new FakeProductRepository(seedProduct());
    const editorials = new RecordingEditorialRepository();
    const journal = new RecordingJournal();

    await new SetProductMediaHandler(
      products,
      editorials,
      new StoredMediaReader([mediaRow("gallery", "https://cdn/1.jpg")]),
      journal,
      new RecordingPublisher(),
      new DirectUnitOfWork(),
    ).execute(new SetProductMediaCommand(PRODUCT_ID, [{ role: "hero", url: "https://cdn/1.jpg" }]));

    expect(journal.types()).toEqual(["product.media_saved"]);
    expect(journal.entries[0]?.payload["changes"]).toMatchObject({
      media: {
        from: [expect.objectContaining({ role: "gallery" })],
        to: [expect.objectContaining({ role: "hero" })],
      },
    });
  });

  /**
   * Le pendant du test précédent : un enregistrement qui ne change RIEN ne doit
   * toujours pas remplir l'historique. Ajouter `role` au diff ne devait pas
   * rendre chaque ouverture d'écran traçante.
   */
  it("n’écrit aucun fait quand la liste renvoyée est identique", async () => {
    const products = new FakeProductRepository(seedProduct());
    const journal = new RecordingJournal();

    await new SetProductMediaHandler(
      products,
      new RecordingEditorialRepository(),
      new StoredMediaReader([mediaRow("hero", "https://cdn/1.jpg")]),
      journal,
      new RecordingPublisher(),
      new DirectUnitOfWork(),
    ).execute(new SetProductMediaCommand(PRODUCT_ID, [{ role: "hero", url: "https://cdn/1.jpg" }]));

    expect(journal.types()).toEqual([]);
  });

  /**
   * La position n'entre pas dans le diff, et n'a pas à y entrer : `changesBetween`
   * compare les tableaux **index par index**, donc permuter deux visuels change
   * les entrées comparées. Vérifié plutôt que supposé — c'est la seule preuve
   * que le rang reste tracé sans champ dédié.
   */
  it("journalise une PERMUTATION, dont le rang est la seule différence", async () => {
    const products = new FakeProductRepository(seedProduct());
    const journal = new RecordingJournal();

    await new SetProductMediaHandler(
      products,
      new RecordingEditorialRepository(),
      new StoredMediaReader([
        mediaRow("gallery", "https://cdn/1.jpg"),
        mediaRow("lifestyle", "https://cdn/2.jpg"),
      ]),
      journal,
      new RecordingPublisher(),
      new DirectUnitOfWork(),
    ).execute(
      new SetProductMediaCommand(PRODUCT_ID, [
        { role: "lifestyle", url: "https://cdn/2.jpg" },
        { role: "gallery", url: "https://cdn/1.jpg" },
      ]),
    );

    expect(journal.types()).toEqual(["product.media_saved"]);
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
