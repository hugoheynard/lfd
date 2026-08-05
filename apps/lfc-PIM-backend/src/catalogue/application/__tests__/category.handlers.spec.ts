import { IdGenerator } from '../../../shared/identity/id-generator.js';
import {
  CategoryHasActiveProductsError,
  CategoryNotFoundError,
} from '../../domain/errors/catalogue-errors.js';
import {
  CategoryRepository,
  type CategoryRecord,
  type NewCategory,
} from '../../domain/ports/category.repository.js';
import type { LocalizedText } from '../../domain/value-objects/localized-text.js';
import {
  ArchiveCategoryCommand,
  ArchiveCategoryHandler,
} from '../archive-category.js';
import { wouldCreateCycle } from '../category-support.js';
import {
  CreateCategoryCommand,
  CreateCategoryHandler,
} from '../create-category.js';
import {
  RenameCategoryCommand,
  RenameCategoryHandler,
} from '../rename-category.js';

class InMemoryCategories extends CategoryRepository {
  readonly rows: CategoryRecord[] = [];
  activeProducts = 0;

  findById(id: string): Promise<CategoryRecord | null> {
    return Promise.resolve(this.rows.find((r) => r.id === id) ?? null);
  }
  listAll(): Promise<CategoryRecord[]> {
    return Promise.resolve([...this.rows]);
  }
  insert(category: NewCategory): Promise<void> {
    this.rows.push({ ...category, isArchived: false });
    return Promise.resolve();
  }
  rename(id: string, name: LocalizedText, slug: LocalizedText): Promise<void> {
    const index = this.rows.findIndex((r) => r.id === id);
    if (index >= 0) {
      this.rows[index] = { ...this.rows[index]!, name, slug };
    }
    return Promise.resolve();
  }
  archive(id: string): Promise<void> {
    const index = this.rows.findIndex((r) => r.id === id);
    if (index >= 0) {
      this.rows[index] = { ...this.rows[index]!, isArchived: true };
    }
    return Promise.resolve();
  }
  countActiveProducts(): Promise<number> {
    return Promise.resolve(this.activeProducts);
  }
  nextPosition(): Promise<number> {
    return Promise.resolve(this.rows.length);
  }
}

class StubIds extends IdGenerator {
  next(): string {
    return 'cat_fixed';
  }
}

describe('CreateCategoryHandler', () => {
  it('crée une famille avec un slug dérivé', async () => {
    const repo = new InMemoryCategories();
    const id = await new CreateCategoryHandler(repo, new StubIds()).execute(
      new CreateCategoryCommand({ nameFr: 'Chocolats fins' }),
    );

    expect(id).toBe('cat_fixed');
    expect(repo.rows[0]?.slug.fr).toBe('chocolats-fins');
  });

  it('refuse un parent inexistant', async () => {
    const repo = new InMemoryCategories();
    await expect(
      new CreateCategoryHandler(repo, new StubIds()).execute(
        new CreateCategoryCommand({
          nameFr: 'Sous-famille',
          parentId: 'absent',
        }),
      ),
    ).rejects.toBeInstanceOf(CategoryNotFoundError);
  });
});

describe('RenameCategoryHandler', () => {
  it('renomme et re-dérive le slug', async () => {
    const repo = new InMemoryCategories();
    await new CreateCategoryHandler(repo, new StubIds()).execute(
      new CreateCategoryCommand({ nameFr: 'Chocolats' }),
    );

    await new RenameCategoryHandler(repo).execute(
      new RenameCategoryCommand('cat_fixed', {
        nameFr: 'Chocolats & pralinés',
      }),
    );

    expect(repo.rows[0]?.slug.fr).toBe('chocolats-pralines');
  });
});

describe('ArchiveCategoryHandler', () => {
  it('refuse d’archiver une famille avec des produits actifs', async () => {
    const repo = new InMemoryCategories();
    await new CreateCategoryHandler(repo, new StubIds()).execute(
      new CreateCategoryCommand({ nameFr: 'Chocolats' }),
    );
    repo.activeProducts = 2;

    await expect(
      new ArchiveCategoryHandler(repo).execute(
        new ArchiveCategoryCommand('cat_fixed'),
      ),
    ).rejects.toBeInstanceOf(CategoryHasActiveProductsError);
  });

  it('archive une famille vide', async () => {
    const repo = new InMemoryCategories();
    await new CreateCategoryHandler(repo, new StubIds()).execute(
      new CreateCategoryCommand({ nameFr: 'Chocolats' }),
    );

    await new ArchiveCategoryHandler(repo).execute(
      new ArchiveCategoryCommand('cat_fixed'),
    );

    expect(repo.rows[0]?.isArchived).toBe(true);
  });
});

describe('wouldCreateCycle', () => {
  it('détecte un cycle dans l’arbre des familles', () => {
    const rows: CategoryRecord[] = [
      {
        id: 'a',
        name: { fr: 'A' },
        slug: { fr: 'a' },
        parentId: null,
        position: 0,
        isArchived: false,
      },
      {
        id: 'b',
        name: { fr: 'B' },
        slug: { fr: 'b' },
        parentId: 'a',
        position: 0,
        isArchived: false,
      },
    ];
    expect(wouldCreateCycle(rows, 'a', 'b')).toBe(true);
    expect(wouldCreateCycle(rows, 'b', 'a')).toBe(false);
  });
});
