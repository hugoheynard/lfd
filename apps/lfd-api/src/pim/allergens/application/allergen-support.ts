import type { AllergenCategory } from "../domain/entities/allergen-category.js";
import type { AllergenEntry } from "../domain/entities/allergen-entry.js";
import {
  AllergenCategoryKeyTakenError,
  AllergenCategoryNotFoundError,
  AllergenCategoryStillCitedError,
  AllergenCodeTakenError,
  AllergenEntryNotFoundError,
  ArchivedAllergenCategoryError,
} from "../domain/errors/allergen-errors.js";
import { AllergenCatalogueReader } from "../domain/ports/allergen-catalogue.reader.js";
import { AllergenCategoryRepository } from "../domain/ports/allergen-category.repository.js";
import { AllergenEntryRepository } from "../domain/ports/allergen-entry.repository.js";

/**
 * Les gardes que les agrégats ne peuvent pas tenir : elles regardent **les
 * autres lignes** du référentiel.
 *
 * Partagées plutôt que recopiées dans chaque cas — c'est la même règle, et deux
 * copies finiraient par ne plus refuser la même chose.
 */

export async function requireCategory(
  categories: AllergenCategoryRepository,
  id: string,
): Promise<AllergenCategory> {
  const category = await categories.findById(id);
  if (category === null) {
    throw new AllergenCategoryNotFoundError(id);
  }
  return category;
}

export async function requireEntry(
  entries: AllergenEntryRepository,
  id: string,
): Promise<AllergenEntry> {
  const entry = await entries.findById(id);
  if (entry === null) {
    throw new AllergenEntryNotFoundError(id);
  }
  return entry;
}

/**
 * La catégorie d'accueil d'une entrée : elle existe **et** elle est encore au
 * référentiel. Y ranger un allergène sous une famille archivée le rendrait
 * proposé sans que l'écran puisse le montrer.
 */
export async function requireLivingCategory(
  categories: AllergenCategoryRepository,
  id: string,
): Promise<AllergenCategory> {
  const category = await requireCategory(categories, id);
  if (category.isArchived) {
    throw new ArchivedAllergenCategoryError(category.key);
  }
  return category;
}

/**
 * Refuse une clé déjà prise. La base tranche en dernier (index unique) : ce
 * regard-ci n'existe que pour répondre une phrase plutôt qu'un code Postgres.
 */
export async function ensureCategoryKeyFree(
  categories: AllergenCategoryRepository,
  key: string,
): Promise<void> {
  if ((await categories.findByKey(key)) !== null) {
    throw new AllergenCategoryKeyTakenError(key);
  }
}

/** Le jumeau côté entrées — un code est une identité de stockage. */
export async function ensureCodeFree(
  entries: AllergenEntryRepository,
  code: string,
): Promise<void> {
  if ((await entries.findByCode(code)) !== null) {
    throw new AllergenCodeTakenError(code);
  }
}

/**
 * Refuse d'archiver une catégorie qui accueille encore des allergènes
 * **proposés**.
 *
 * La FK `Restrict` ne protège que de l'effacement : rien en base n'empêche
 * d'archiver une catégorie sous ses entrées, qui resteraient offertes à la
 * saisie sans famille visible. Les entrées déjà archivées ne retiennent rien —
 * elles ne sont plus proposées non plus.
 *
 * La question se pose au **lecteur de catalogue** et non au dépôt d'écriture :
 * c'est une lecture, le port qui la sert existe, et faire grossir un port
 * d'écriture d'une méthode de comptage l'aurait rendu CRUD pour un seul appel.
 */
export async function ensureCategoryUncited(
  reader: AllergenCatalogueReader,
  category: AllergenCategory,
): Promise<void> {
  const catalogue = await reader.catalogue();
  const found = catalogue.find((view) => view.id === category.id);
  const cited = (found?.entries ?? []).filter((entry) => entry.archivedAt === null).length;
  if (cited > 0) {
    throw new AllergenCategoryStillCitedError(category.key, cited);
  }
}
