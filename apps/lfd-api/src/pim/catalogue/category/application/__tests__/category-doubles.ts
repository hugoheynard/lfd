import type { Audience } from "../../../shared/domain/value-objects/audience.js";
import { Category } from "../../domain/entities/category.js";
import { AllCategoriesReader } from "../../domain/ports/all-categories.reader.js";
import { CategoryRepository } from "../../domain/ports/category.repository.js";
import type { CategorySnapshot } from "../../domain/entities/category.js";

/**
 * Les doubles d'une famille seule, partagés par les suites d'audience des
 * familles et des fiches : chacun hérite du port qu'il joue, et reconstitue à
 * chaque lecture — le handler ne tient jamais l'instance du test.
 */

export const CATEGORY_ID = "cat_patisserie";

/** Une famille, à l'audience donnée. */
export function family(audience: Audience, isArchived = false): Category {
  return Category.reconstitute({
    id: CATEGORY_ID,
    name: { fr: "Pâtisserie" },
    slug: { fr: "patisserie" },
    parentId: null,
    position: 0,
    isArchived,
    vatByContext: {},
    audience,
  });
}

/** Une seule famille, relue à chaque appel ; ce qu'on y écrit est gardé. */
export class OneCategory extends CategoryRepository {
  constructor(private current: Category | null) {
    super();
  }
  get stored(): Category | null {
    return this.current === null ? null : Category.reconstitute(this.current.snapshot());
  }
  findById(id: string): Promise<Category | null> {
    return Promise.resolve(id === this.current?.id ? this.stored : null);
  }
  add(category: Category): Promise<void> {
    return this.save(category);
  }
  save(category: Category): Promise<void> {
    this.current = Category.reconstitute(category.snapshot());
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

/** La liste de toutes les familles, lue sur la famille seule du double. */
export class ListedCategories extends AllCategoriesReader {
  constructor(private readonly categories: OneCategory) {
    super();
  }
  all(): Promise<CategorySnapshot[]> {
    const stored = this.categories.stored;
    return Promise.resolve(stored === null ? [] : [stored.snapshot()]);
  }
}
