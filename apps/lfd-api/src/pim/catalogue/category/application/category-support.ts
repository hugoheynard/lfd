import { CategoryNotFoundError, CategorySlugTakenError } from "../domain/errors/category-errors.js";
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

/**
 * Refuse une famille dont le slug est déjà porté par une AUTRE — en la nommant.
 *
 * Le slug étant dérivé du nom sans casse ni accents, deux noms qui ne
 * diffèrent que par là sont refusés ici. Les archivées comptent : elles gardent
 * leurs fiches, donc leur préfixe de SKU.
 *
 * 🔴 **Ce refus applicatif est, en production, la SEULE garde** (décidé le
 * 2026-09-26). La migration `20260826090000_unicite_slug_rang_emplacement`
 * pose `category_slug_fr_unique`, et la base de dev l'a ; la production porte
 * pourtant deux familles actives au slug `viennoiseries`, que Hugo n'archivera
 * pas. Un index est la bonne garantie — une lecture ne ferme pas la course
 * entre deux créations —, il viendra quand la production n'aura plus de
 * doublon. D'ici là : aucun index nouveau, aucune migration qui touche ces
 * familles, et aucun refus quand on modifie autre chose que le nom.
 */
export async function assertSlugFree(
  categories: CategoryRepository,
  category: Category,
): Promise<void> {
  const holder = await categories.findBySlugFr(category.slug.fr);
  if (holder !== null && holder.id !== category.id) {
    throw new CategorySlugTakenError(category.slug.fr, {
      id: holder.id,
      name: holder.name.fr,
      isArchived: holder.isArchived,
    });
  }
}
