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
import { ProductCommands } from '../product-commands.service.js';

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
      },
    ],
  };
}

/**
 * Dépôt produit en mémoire — le domaine se teste sans base ni framework. Les
 * méthodes ne sont pas `async` (aucun `await`) : elles renvoient une promesse
 * déjà résolue, ce qui satisfait `require-await` sans dérogation.
 */
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

function makeCommands(product: ProductRecord | null = seedProduct()): {
  commands: ProductCommands;
  products: FakeProductRepository;
  nutrition: RecordingNutritionRepository;
  editorials: RecordingEditorialRepository;
} {
  const products = new FakeProductRepository(product);
  const nutrition = new RecordingNutritionRepository();
  const editorials = new RecordingEditorialRepository();
  let seq = 0;
  const commands = new ProductCommands(
    products,
    new FakeCategoryRepository(),
    nutrition,
    editorials,
    { next: () => `id_${(seq += 1)}` },
    { isTaken: () => Promise.resolve(false) },
  );
  return { commands, products, nutrition, editorials };
}

describe('ProductCommands — édition', () => {
  it('change le kind d’un produit existant', async () => {
    const { commands, products } = makeCommands();
    await commands.changeKind(PRODUCT_ID, 'daily');
    expect(products.snapshot()?.kind).toBe('daily');
  });

  it('refuse de changer le kind d’un produit inconnu', async () => {
    const { commands } = makeCommands();
    await expect(
      commands.changeKind('prd_absent', 'daily'),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
  });

  it('reclasse sous une famille active', async () => {
    const { commands, products } = makeCommands();
    await commands.moveToCategory(PRODUCT_ID, 'cat_active');
    expect(products.snapshot()?.categoryId).toBe('cat_active');
  });

  it('refuse une famille inconnue', async () => {
    const { commands } = makeCommands();
    await expect(
      commands.moveToCategory(PRODUCT_ID, 'cat_absent'),
    ).rejects.toBeInstanceOf(CategoryNotFoundError);
  });

  it('refuse une famille archivée', async () => {
    const { commands } = makeCommands();
    await expect(
      commands.moveToCategory(PRODUCT_ID, 'cat_archived'),
    ).rejects.toBeInstanceOf(CategoryArchivedError);
  });

  it('tarife la déclinaison par défaut', async () => {
    const { commands, products } = makeCommands();
    await commands.setVariantPrice(PRODUCT_ID, VARIANT_ID, 450);
    expect(products.snapshot()?.variants[0]?.priceCents).toBe(450);
  });

  it('dé-tarife avec null', async () => {
    const seeded = seedProduct();
    seeded.variants[0] = { ...seeded.variants[0]!, priceCents: 999 };
    const { commands, products } = makeCommands(seeded);
    await commands.setVariantPrice(PRODUCT_ID, VARIANT_ID, null);
    expect(products.snapshot()?.variants[0]?.priceCents).toBeNull();
  });

  it('refuse de tarifer une déclinaison d’un autre produit', async () => {
    const { commands } = makeCommands();
    await expect(
      commands.setVariantPrice(PRODUCT_ID, 'variant_etranger', 100),
    ).rejects.toBeInstanceOf(VariantNotFoundError);
  });

  it('renseigne le poids de la déclinaison', async () => {
    const { commands, products } = makeCommands();
    await commands.setVariantWeight(PRODUCT_ID, VARIANT_ID, 250);
    expect(products.snapshot()?.variants[0]?.weightGrams).toBe(250);
  });

  it('met à jour l’éditorial sans toucher aux médias (liste vide)', async () => {
    const { commands, editorials } = makeCommands();
    await commands.updateEditorial(PRODUCT_ID, {
      descriptionShort: 'Torréfaction douce',
    });
    expect(editorials.calls).toHaveLength(1);
    expect(editorials.calls[0]?.media).toEqual([]);
    expect(editorials.calls[0]?.editorial.descriptionShort).toEqual({
      fr: 'Torréfaction douce',
    });
  });

  it('déclare la fiche réglementaire de la déclinaison', async () => {
    const { commands, nutrition } = makeCommands();
    await commands.declareNutrition(PRODUCT_ID, VARIANT_ID, {
      allergens: ['TBD_BARLEY'],
    });
    expect(nutrition.calls).toHaveLength(1);
    expect(nutrition.calls[0]?.variantId).toBe(VARIANT_ID);
  });

  it('refuse une déclaration sur une déclinaison étrangère', async () => {
    const { commands } = makeCommands();
    await expect(
      commands.declareNutrition(PRODUCT_ID, 'variant_etranger', {
        allergens: [],
      }),
    ).rejects.toBeInstanceOf(VariantNotFoundError);
  });
});
