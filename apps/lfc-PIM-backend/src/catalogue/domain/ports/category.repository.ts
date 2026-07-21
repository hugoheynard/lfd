import type { LocalizedText } from '../value-objects/localized-text.js';

/**
 * Vue d'une famille telle que la persistance la rend.
 * Aucune colonne système : le domaine ne connaît ni `created_at` ni `updated_at`.
 */
export interface CategoryRecord {
  readonly id: string;
  readonly name: LocalizedText;
  readonly slug: LocalizedText;
  readonly parentId: string | null;
  readonly position: number;
  readonly isArchived: boolean;
}

export interface NewCategory {
  readonly id: string;
  readonly name: LocalizedText;
  readonly slug: LocalizedText;
  readonly parentId: string | null;
  readonly position: number;
}

/** Port : le domaine dépend de cette abstraction, jamais de Prisma. */
export abstract class CategoryRepository {
  abstract findById(id: string): Promise<CategoryRecord | null>;
  abstract listAll(): Promise<CategoryRecord[]>;
  abstract insert(category: NewCategory): Promise<void>;
  abstract rename(
    id: string,
    name: LocalizedText,
    slug: LocalizedText,
  ): Promise<void>;
  abstract archive(id: string): Promise<void>;
  abstract countActiveProducts(id: string): Promise<number>;
  abstract nextPosition(parentId: string | null): Promise<number>;
}
