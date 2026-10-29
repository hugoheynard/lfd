import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import { RecordingCatalogEmitter } from "../../../shared/domain/ports/__tests__/catalog-emitter-doubles.js";
import { Product, type ProductSnapshot } from "../../domain/entities/product.js";
import type {
  AllergenDeclaration,
  NutritionValues,
} from "../../domain/value-objects/nutrition-declaration.js";
import {
  EditorialReader,
  type ProductEditorialView,
  type ProductMediaRecord,
} from "../../domain/ports/editorial-reader.js";
import { EditorialRepository } from "../../domain/ports/editorial.repository.js";
import { NutritionValuesRepository } from "../../domain/ports/nutrition-values.repository.js";
import { ProductRepository } from "../../domain/ports/product.repository.js";
import { VariantAllergensRepository } from "../../domain/ports/variant-allergens.repository.js";
import type { SkuAvailability } from "../../domain/services/sku-generator.js";
import type { Editorial, MediaItem } from "../../domain/value-objects/editorial.js";
import { DefaultVariantNotDiscontinuableError } from "../../domain/errors/variant-lifecycle-errors.js";
import { DetachedVariantNotRestorableError } from "../../domain/errors/variant-lifecycle-errors.js";
import {
  DetachProductVariantCommand,
  DetachProductVariantHandler,
} from "../detach-product-variant.js";
import {
  DiscontinueProductVariantCommand,
  DiscontinueProductVariantHandler,
} from "../discontinue-product-variant.js";
import {
  RestoreProductVariantCommand,
  RestoreProductVariantHandler,
} from "../restore-product-variant.js";
import { bareVariant, PRODUCT_ID, tarte } from "./audience-doubles.js";
import { CountingPimIds, RecordingDurable } from "./durable-doubles.js";

/**
 * **Les trois gestes d'une déclinaison** (`plan-gestes-de-declinaison.md`) :
 * ce qu'ils écrivent, journalisent et émettent. Les refus sont ceux de
 * l'agrégat (suite du domaine) ; on vérifie ici qu'un refus n'écrit rien.
 */

const SECOND_ID = "prd_tarte_v2";

/** Plusieurs fiches, reconstituées à chaque lecture. */
class Products extends ProductRepository {
  readonly byId = new Map<string, ProductSnapshot>();
  readonly added: string[] = [];

  constructor(...snapshots: ProductSnapshot[]) {
    super();
    for (const snapshot of snapshots) {
      this.byId.set(snapshot.id, snapshot);
    }
  }
  findById(id: string): Promise<Product | null> {
    const found = this.byId.get(id);
    return Promise.resolve(found === undefined ? null : Product.reconstitute(found));
  }
  listAll(): Promise<Product[]> {
    return Promise.resolve(
      [...this.byId.values()].map((snapshot) => Product.reconstitute(snapshot)),
    );
  }
  add(product: Product): Promise<void> {
    this.added.push(product.id);
    return this.save(product);
  }
  save(product: Product): Promise<void> {
    this.byId.set(product.id, product.persistenceSnapshot());
    return Promise.resolve();
  }
}

class Allergens extends VariantAllergensRepository {
  readonly saved = new Map<string, AllergenDeclaration>();
  save(variantId: string, declaration: AllergenDeclaration): Promise<void> {
    this.saved.set(variantId, declaration);
    return Promise.resolve();
  }
}

class Nutrition extends NutritionValuesRepository {
  readonly saved = new Map<string, NutritionValues>();
  save(variantId: string, values: NutritionValues): Promise<void> {
    this.saved.set(variantId, values);
    return Promise.resolve();
  }
}

class Stories extends EditorialReader {
  findByProduct(): Promise<ProductEditorialView | null> {
    return Promise.resolve({
      descriptionShort: { fr: "Une tarte acidulée." },
      descriptionLong: null,
      story: null,
      pairing: null,
      brand: null,
      seoTitle: null,
      seoDescription: null,
    });
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

class Editorials extends EditorialRepository {
  readonly saved = new Map<string, { editorial: Editorial; media: readonly MediaItem[] }>();
  save(productId: string, editorial: Editorial, media: readonly MediaItem[]): Promise<void> {
    this.saved.set(productId, { editorial, media });
    return Promise.resolve();
  }
  replaceMedia(): Promise<void> {
    return Promise.resolve();
  }
}

const FREE: SkuAvailability = { isTaken: () => Promise.resolve(false) };

function origin(): ProductSnapshot {
  return tarte({
    variants: [
      bareVariant({
        priceCents: 3_200,
        proPriceMillicents: 2_730_331,
        allergenSheet: { declared: ["gluten"], mayContain: [] },
        nutrition: {
          energyKcal: 320,
          fatG: null,
          saturatedFatG: null,
          carbsG: null,
          sugarsG: null,
          proteinG: null,
          saltG: null,
          glycemicIndex: null,
        },
      }),
      bareVariant({
        id: SECOND_ID,
        sku: "PAT-7-2",
        name: { fr: "Six parts" },
        isDefault: false,
        position: 1,
        pricingFollowsDefault: true,
        regulatoryFollowsDefault: true,
        nutritionFollowsDefault: true,
      }),
    ],
  });
}

function setup() {
  const products = new Products(origin());
  const journal = new RecordingJournal();
  const emitter = new RecordingCatalogEmitter();
  const uow = new DirectUnitOfWork();
  const allergens = new Allergens();
  const nutrition = new Nutrition();
  const editorials = new Editorials();
  return {
    products,
    journal,
    emitter,
    allergens,
    nutrition,
    editorials,
    discontinue: new DiscontinueProductVariantHandler(products, journal, uow, emitter),
    restore: new RestoreProductVariantHandler(products, journal, uow, emitter),
    detach: new DetachProductVariantHandler(
      products,
      allergens,
      nutrition,
      new Stories(),
      editorials,
      journal,
      new RecordingDurable(),
      uow,
      new CountingPimIds(),
      FREE,
      emitter,
    ),
  };
}

describe("DiscontinueProductVariantHandler", () => {
  it("archive, journalise et émet la fiche", async () => {
    const { discontinue, products, journal, emitter } = setup();

    await discontinue.execute(new DiscontinueProductVariantCommand(PRODUCT_ID, SECOND_ID));

    const stored = products.byId.get(PRODUCT_ID);
    expect(stored?.variants.find((variant) => variant.id === SECOND_ID)?.isDiscontinued).toBe(true);
    expect(journal.types()).toEqual(["product.variant_discontinued"]);
    expect(emitter.products).toEqual([[PRODUCT_ID]]);
  });

  it("un refus de l'agrégat n'écrit ni ne journalise rien", async () => {
    const { discontinue, journal, emitter } = setup();

    await expect(
      discontinue.execute(new DiscontinueProductVariantCommand(PRODUCT_ID, "prd_tarte_v1")),
    ).rejects.toThrow(DefaultVariantNotDiscontinuableError);
    expect(journal.types()).toEqual([]);
    expect(emitter.products).toEqual([]);
  });
});

describe("DetachProductVariantHandler", () => {
  it("écrit le nouveau produit, sa fiche réglementaire et ses textes, puis archive l'origine", async () => {
    const { detach, products, journal, emitter, allergens, nutrition, editorials } = setup();

    const bornId = await detach.execute(new DetachProductVariantCommand(PRODUCT_ID, SECOND_ID));

    const born = products.byId.get(bornId);
    const bornVariant = born?.variants[0];
    expect(products.added).toEqual([bornId]);
    expect(born).toMatchObject({ status: "draft", originVariantId: SECOND_ID });
    expect(bornVariant).toMatchObject({ priceCents: 3_200, pricingFollowsDefault: false });
    expect(bornVariant?.sku).toBe(`${born?.sku ?? ""}-1`);
    expect(allergens.saved.get(bornVariant?.id ?? "")).toEqual({
      allergens: ["gluten"],
      mayContain: [],
    });
    expect(nutrition.saved.get(bornVariant?.id ?? "")).toMatchObject({ energyKcal: 320 });
    expect(editorials.saved.get(bornId)?.editorial.descriptionShort).toEqual({
      fr: "Une tarte acidulée.",
    });
    const archived = products.byId.get(PRODUCT_ID)?.variants.find((v) => v.id === SECOND_ID);
    expect(archived).toMatchObject({ isDiscontinued: true, detachedToProductId: bornId });
    expect(journal.types()).toEqual(["product.created_from_variant", "product.variant_detached"]);
    expect(emitter.products).toEqual([[PRODUCT_ID, bornId]]);
  });
});

describe("RestoreProductVariantHandler", () => {
  it("désarchive, journalise et émet", async () => {
    const { discontinue, restore, products, journal } = setup();
    await discontinue.execute(new DiscontinueProductVariantCommand(PRODUCT_ID, SECOND_ID));

    await restore.execute(new RestoreProductVariantCommand(PRODUCT_ID, SECOND_ID));

    const stored = products.byId.get(PRODUCT_ID);
    expect(stored?.variants.find((v) => v.id === SECOND_ID)?.isDiscontinued).toBe(false);
    expect(journal.types()).toEqual(["product.variant_discontinued", "product.variant_restored"]);
  });

  it("refuse une déclinaison détachée en nommant le produit qu'elle est devenue", async () => {
    const { detach, restore, products } = setup();
    const bornId = await detach.execute(new DetachProductVariantCommand(PRODUCT_ID, SECOND_ID));
    const bornSku = products.byId.get(bornId)?.sku ?? "";

    const refusal = restore.execute(new RestoreProductVariantCommand(PRODUCT_ID, SECOND_ID));

    await expect(refusal).rejects.toThrow(DetachedVariantNotRestorableError);
    await expect(
      restore.execute(new RestoreProductVariantCommand(PRODUCT_ID, SECOND_ID)),
    ).rejects.toThrow(new RegExp(`${bornSku} — Six parts`, "u"));
  });
});
