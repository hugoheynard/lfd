import { CategoryNotFoundError, CategorySlugTakenError } from "../domain/errors/category-errors.js";
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

/**
 * Exige que le slug dérivé soit **libre**.
 *
 * L'agrégat dérive le slug de son nom et ne le laisse pas entrer par
 * l'extérieur ; il ne peut donc pas savoir si un voisin le porte déjà. C'est la
 * même forme que « le parent doit exister » : une règle qui porte sur les
 * autres, donc tenue par le handler, après que l'agrégat a dérivé.
 */
export async function requireFreeSlug(
  categories: CategoryRepository,
  category: Category,
): Promise<void> {
  const slugFr = category.slug.fr;
  const holder = await categories.findBySlugFr(slugFr);
  if (holder !== null && holder.id !== category.id) {
    throw new CategorySlugTakenError(slugFr, holder.id);
  }
}
