import { CategoryNotFoundError } from "../domain/errors/category-errors.js";
import type { Category } from "../domain/entities/category.js";
import { CategoryRepository } from "../domain/ports/category.repository.js";

/**
 * Une famille citée au journal, avec son nom français **du moment** (D5 du
 * plan des phrases du journal) ; `null` = la racine, qui n'a pas de famille.
 */
export function namedCategory(
  category: Category | null,
): { readonly id: string; readonly name: string } | null {
  return category === null ? null : { id: category.id, name: category.name.fr };
}

/** Charge une famille ou refuse — le seul geste vraiment partagé des verbes. */
export async function requireCategory(
  categories: CategoryRepository,
  id: string,
): Promise<Category> {
  const category = await categories.findById(id);
  if (category === null) {
    throw new CategoryNotFoundError(id);
  }
  return category;
}
