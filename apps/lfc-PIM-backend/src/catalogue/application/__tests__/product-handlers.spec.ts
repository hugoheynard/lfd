import {
  CategoryArchivedError,
  CategoryNotFoundError,
  ProductNotFoundError,
  VariantNotFoundError,
} from '../../domain/errors/catalogue-errors.js';
import type {
  CategoryRecord,
  NewCategory,
} from '../../domain/ports/category.repository.js';
import { CategoryRepository } from '../../domain/ports/category.repository.js';
import { EditorialRepository } from '../../domain/ports/editorial.repository.js';
import { NutritionRepository } from '../../domain/ports/nutrition.repository.js';
import {
  ProductRepository,
  type NewProduct,
  type ProductKind,
  type ProductRecord,
  type ProductStatus,
} from '../../domain/ports/product.repository.js';
import type {
  Editorial,
  MediaItem,
} from '../../domain/value-objects/editorial.js';
import type { LocalizedText } from '../../domain/value-objects/localized-text.js';
import type { NutritionDeclaration } from '../../domain/value-objects/nutrition-declaration.js';
import { ArchiveProductHandler } from '../archive-product.js';
import { ArchiveProductCommand } from '../archive-product.js';
import { DeclareProductNutritionHandler } from '../declare-product-nutrition.js';
import { DeclareProductNutritionCommand } from '../declare-product-nutrition.js';
import { RestoreProductHandler } from '../restore-product.js';
import { RestoreProductCommand } from '../restore-product.js';
import { UpdateProductEditorialHandler } from '../update-product-editorial.js';
import { UpdateProductEditorialCommand } from '../update-product-editorial.js';
import { UpdateProductIdentityHandler } from '../update-product-identity.js';
import { UpdateProductIdentityCommand } from '../update-product-identity.js';
import { UpdateVariantPricingHandler } from '../update-variant-pricing.js';
import { UpdateVariantPricingCommand } from '../update-variant-pricing.js';

const PRODUCT_ID = 'prd_1';
const VARIANT_ID = 'prd_1_v1';

function seedProduct(): ProductRecord {
  return {
    id: PRODUCT_ID,
    sku: 'CAFE-1',
    name: { fr: 'Café' },
    slug: { fr: 'cafe' },
    kind: 'resale',
    categoryId: 'cat_active',
    status: 'draft',
    variants: [
      {
        id: VARIANT_ID,
        sku: 'CAFE-1-1',
        name: { fr: 'Café' },
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
  };
}

class FakeProductRepository extends ProductRepository {
  constructor(private product: ProductRecord | null) {
    super();
  }
  findById(id: string): Promise<ProductRecord | null> {
    return Promise.resolve(
      this.product !== null && this.product.id === id ? this.product : null,
    );
  }
  listAll(): Promise<ProductRecord[]> {
    return Promise.resolve(this.product === null ? [] : [this.product]);
  }
  createWithDefaultVariant(product: NewProduct): Promise<void> {
    void product;
    return Promise.resolve();
  }
  rename(id: string, name: LocalizedText, slug: LocalizedText): Promise<void> {
    this.patch(id, { name, slug });
    return Promise.resolve();
  }
  setStatus(id: string, status: ProductStatus): Promise<void> {
    this.patch(id, { status });
    return Promise.resolve();
  }
  setKind(id: string, kind: ProductKind): Promise<void> {
    this.patch(id, { kind });
    return Promise.resolve();
  }
  moveToCategory(id: string, categoryId: string): Promise<void> {
    this.patch(id, { categoryId });
    return Promise.resolve();
  }
  setVariantPrice(variantId: string, priceCents: number | null): Promise<void> {
    this.patchVariant(variantId, { priceCents });
    return Promise.resolve();
  }
  setVariantWeight(
    variantId: string,
    weightGrams: number | null,
  ): Promise<void> {
    this.patchVariant(variantId, { weightGrams });
    return Promise.resolve();
  }

  snapshot(): ProductRecord | null {
    return this.product;
  }

  private patch(id: string, fields: Partial<ProductRecord>): void {
    if (this.product !== null && this.product.id === id) {
      this.product = { ...this.product, ...fields };
    }
  }
  private patchVariant(
    variantId: string,
    fields: { priceCents?: number | null; weightGrams?: number | null },
  ): void {
    if (this.product === null) {
      return;
    }
    this.product = {
      ...this.product,
      variants: this.product.variants.map((variant) =>
        variant.id === variantId ? { ...variant, ...fields } : variant,
      ),
    };
  }
}

class FakeCategoryRepository extends CategoryRepository {
  findById(id: string): Promise<CategoryRecord | null> {
    if (id === 'cat_active') {
      return Promise.resolve({
        id,
        name: { fr: 'Boissons' },
        slug: { fr: 'boissons' },
        parentId: null,
        position: 1,
        isArchived: false,
      });
    }
    if (id === 'cat_archived') {
      return Promise.resolve({
        id,
        name: { fr: 'Ancien' },
        slug: { fr: 'ancien' },
        parentId: null,
        position: 2,
        isArchived: true,
      });
    }
    return Promise.resolve(null);
  }
  listAll(): Promise<CategoryRecord[]> {
    return Promise.resolve([]);
  }
  insert(category: NewCategory): Promise<void> {
    void category;
    return Promise.resolve();
  }
  rename(): Promise<void> {
    return Promise.resolve();
  }
  archive(): Promise<void> {
    return Promise.resolve();
  }
  countActiveProducts(): Promise<number> {
    return Promise.resolve(0);
  }
  nextPosition(): Promise<number> {
    return Promise.resolve(1);
  }
}

class RecordingNutritionRepository extends NutritionRepository {
  readonly calls: { variantId: string; declaration: NutritionDeclaration }[] =
    [];
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
  save(
    productId: string,
    editorial: Editorial,
    media: readonly MediaItem[],
  ): Promise<void> {
    this.calls.push({ productId, editorial, media });
    return Promise.resolve();
  }
}

describe('UpdateProductIdentityHandler', () => {
  it('met à jour nom + nature + famille en une opération', async () => {
    const products = new FakeProductRepository(seedProduct());
    await new UpdateProductIdentityHandler(
      products,
      new FakeCategoryRepository(),
    ).execute(
      new UpdateProductIdentityCommand(PRODUCT_ID, {
        nameFr: 'Moka',
        kind: 'daily',
        categoryId: 'cat_active',
      }),
    );
    const snapshot = products.snapshot();
    expect(snapshot?.name.fr).toBe('Moka');
    expect(snapshot?.kind).toBe('daily');
    expect(snapshot?.categoryId).toBe('cat_active');
  });

  it('refuse une famille archivée (rien n’est écrit)', async () => {
    const products = new FakeProductRepository(seedProduct());
    await expect(
      new UpdateProductIdentityHandler(
        products,
        new FakeCategoryRepository(),
      ).execute(
        new UpdateProductIdentityCommand(PRODUCT_ID, {
          nameFr: 'Moka',
          kind: 'daily',
          categoryId: 'cat_archived',
        }),
      ),
    ).rejects.toBeInstanceOf(CategoryArchivedError);
    expect(products.snapshot()?.name.fr).toBe('Café');
  });

  it('refuse une famille inconnue', async () => {
    const products = new FakeProductRepository(seedProduct());
    await expect(
      new UpdateProductIdentityHandler(
        products,
        new FakeCategoryRepository(),
      ).execute(
        new UpdateProductIdentityCommand(PRODUCT_ID, {
          nameFr: 'Moka',
          kind: 'daily',
          categoryId: 'cat_absent',
        }),
      ),
    ).rejects.toBeInstanceOf(CategoryNotFoundError);
  });

  it('refuse un produit inconnu', async () => {
    const products = new FakeProductRepository(seedProduct());
    await expect(
      new UpdateProductIdentityHandler(
        products,
        new FakeCategoryRepository(),
      ).execute(
        new UpdateProductIdentityCommand('prd_absent', {
          nameFr: 'X',
          kind: 'daily',
          categoryId: 'cat_active',
        }),
      ),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
  });
});

describe('UpdateVariantPricingHandler', () => {
  it('met à jour tarif + poids en une opération', async () => {
    const products = new FakeProductRepository(seedProduct());
    await new UpdateVariantPricingHandler(products).execute(
      new UpdateVariantPricingCommand(PRODUCT_ID, VARIANT_ID, {
        priceCents: 500,
        weightGrams: 300,
      }),
    );
    expect(products.snapshot()?.variants[0]?.priceCents).toBe(500);
    expect(products.snapshot()?.variants[0]?.weightGrams).toBe(300);
  });

  it('dé-tarife avec null', async () => {
    const seeded = seedProduct();
    seeded.variants[0] = { ...seeded.variants[0]!, priceCents: 999 };
    const products = new FakeProductRepository(seeded);
    await new UpdateVariantPricingHandler(products).execute(
      new UpdateVariantPricingCommand(PRODUCT_ID, VARIANT_ID, {
        priceCents: null,
        weightGrams: null,
      }),
    );
    expect(products.snapshot()?.variants[0]?.priceCents).toBeNull();
  });

  it('refuse une déclinaison d’un autre produit', async () => {
    const products = new FakeProductRepository(seedProduct());
    await expect(
      new UpdateVariantPricingHandler(products).execute(
        new UpdateVariantPricingCommand(PRODUCT_ID, 'variant_etranger', {
          priceCents: 100,
          weightGrams: null,
        }),
      ),
    ).rejects.toBeInstanceOf(VariantNotFoundError);
  });
});

describe('UpdateProductEditorialHandler', () => {
  it('met à jour l’éditorial sans toucher aux médias (liste vide)', async () => {
    const products = new FakeProductRepository(seedProduct());
    const editorials = new RecordingEditorialRepository();
    await new UpdateProductEditorialHandler(products, editorials).execute(
      new UpdateProductEditorialCommand(PRODUCT_ID, {
        descriptionShort: 'Torréfaction douce',
      }),
    );
    expect(editorials.calls).toHaveLength(1);
    expect(editorials.calls[0]?.media).toEqual([]);
    expect(editorials.calls[0]?.editorial.descriptionShort).toEqual({
      fr: 'Torréfaction douce',
    });
  });
});

describe('DeclareProductNutritionHandler', () => {
  it('déclare la fiche réglementaire de la déclinaison', async () => {
    const products = new FakeProductRepository(seedProduct());
    const nutrition = new RecordingNutritionRepository();
    await new DeclareProductNutritionHandler(products, nutrition).execute(
      new DeclareProductNutritionCommand(PRODUCT_ID, VARIANT_ID, {
        allergens: ['TBD_BARLEY'],
      }),
    );
    expect(nutrition.calls).toHaveLength(1);
    expect(nutrition.calls[0]?.variantId).toBe(VARIANT_ID);
  });

  it('refuse une déclaration sur une déclinaison étrangère', async () => {
    const products = new FakeProductRepository(seedProduct());
    await expect(
      new DeclareProductNutritionHandler(
        products,
        new RecordingNutritionRepository(),
      ).execute(
        new DeclareProductNutritionCommand(PRODUCT_ID, 'variant_etranger', {
          allergens: [],
        }),
      ),
    ).rejects.toBeInstanceOf(VariantNotFoundError);
  });
});

describe('Archive / Restore product', () => {
  it('archive puis restaure le produit', async () => {
    const products = new FakeProductRepository(seedProduct());

    await new ArchiveProductHandler(products).execute(
      new ArchiveProductCommand(PRODUCT_ID),
    );
    expect(products.snapshot()?.status).toBe('archived');

    await new RestoreProductHandler(products).execute(
      new RestoreProductCommand(PRODUCT_ID),
    );
    expect(products.snapshot()?.status).toBe('draft');
  });

  it('refuse d’archiver un produit inconnu', async () => {
    const products = new FakeProductRepository(seedProduct());
    await expect(
      new ArchiveProductHandler(products).execute(
        new ArchiveProductCommand('prd_absent'),
      ),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
  });
});
