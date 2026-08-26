import { CategoryNotFoundError } from "../domain/errors/category-errors.js";
import type { Category } from "../domain/entities/category.js";
import { CategoryRepository } from "../domain/ports/category.repository.js";

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
