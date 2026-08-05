import { CategoryNotFoundError } from '../domain/errors/catalogue-errors.js';
import {
  CategoryRepository,
  type CategoryRecord,
} from '../domain/ports/category.repository.js';
import {
  slugify,
  type LocalizedText,
} from '../domain/value-objects/localized-text.js';

/** Helpers **partagés** par les handlers famille — pas de règle métier propre. */
export function slugOf(name: LocalizedText): LocalizedText {
  return name.en === undefined
    ? { fr: slugify(name.fr) }
    : { fr: slugify(name.fr), en: slugify(name.en) };
}

export async function requireCategory(
  categories: CategoryRepository,
  id: string,
): Promise<CategoryRecord> {
  const category = await categories.findById(id);
  if (category === null) {
    throw new CategoryNotFoundError(id);
  }
  return category;
}

/** Réservé au déplacement de famille (verbe `MoveCategory`), pas encore exposé. */
export function wouldCreateCycle(
  categories: readonly CategoryRecord[],
  movedId: string,
  targetParentId: string,
): boolean {
  let cursor: string | null = targetParentId;
  while (cursor !== null) {
    if (cursor === movedId) {
      return true;
    }
    const parent: CategoryRecord | undefined = categories.find(
      (candidate) => candidate.id === cursor,
    );
    cursor = parent?.parentId ?? null;
  }
  return false;
}
