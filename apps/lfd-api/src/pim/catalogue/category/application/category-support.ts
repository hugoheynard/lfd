import { assertFree } from "../../../shared/assert-free.js";
import { CategorySlugTakenError } from "../domain/errors/category-errors.js";
import type { Category } from "../domain/entities/category.js";
import { CategoryRepository } from "../domain/ports/category.repository.js";

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
  assertFree(
    await categories.findBySlugFr(category.slug.fr),
    (holder) =>
      new CategorySlugTakenError(category.slug.fr, {
        id: holder.id,
        name: holder.name.fr,
        isArchived: holder.isArchived,
      }),
    (holder) => holder.id === category.id,
  );
}
