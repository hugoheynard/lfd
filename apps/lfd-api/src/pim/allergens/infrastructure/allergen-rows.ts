import {
  localizedColumn,
  readLocalizedColumn,
} from "../../catalogue/shared/infrastructure/json-readers.js";
import { AllergenCategory } from "../domain/entities/allergen-category.js";
import { AllergenEntry } from "../domain/entities/allergen-entry.js";

/**
 * Les **mappers** du référentiel — ligne ↔ agrégat, dans un seul fichier.
 *
 * Partagés par les trois adaptateurs (les deux dépôts d'écriture et le lecteur
 * de catalogue) parce que c'est la même table lue par trois portes. Une copie
 * par adaptateur finirait par ne plus lire les mêmes langues — c'est exactement
 * la panne que `localizedColumn` raconte à son endroit.
 *
 * Les lignes sont décrites ICI par des interfaces à nous : aucun type `Prisma.*`
 * ne franchit `infrastructure/`, et une colonne `Json` arrive de toute façon en
 * `unknown` — c'est sa forme qu'on vérifie, pas qu'on affirme.
 */

/** Une ligne de `pim.allergen_category`, telle que le client la rend. */
export interface AllergenCategoryRow {
  readonly id: string;
  readonly key: string;
  readonly name: unknown;
  readonly incoCategory: string | null;
  readonly official: boolean;
  readonly position: number;
  readonly archivedAt: Date | null;
}

/** Une ligne de `pim.allergen_entry`. */
export interface AllergenEntryRow {
  readonly id: string;
  readonly code: string;
  readonly name: unknown;
  readonly categoryId: string;
  readonly official: boolean;
  readonly archivedAt: Date | null;
}

/**
 * Rehydrate la catégorie. `inco_category` passe en **texte** : c'est l'agrégat
 * qui la ramène dans l'union des 14 (D1), et lui seul — l'adaptateur n'a pas à
 * savoir ce qu'est l'annexe II.
 */
export function toCategory(row: AllergenCategoryRow): AllergenCategory {
  return AllergenCategory.reconstitute({
    id: row.id,
    key: row.key,
    name: readLocalizedColumn(row.name, "allergen_category.name"),
    incoCategory: row.incoCategory,
    official: row.official,
    position: row.position,
    archivedAt: row.archivedAt,
  });
}

export function toEntry(row: AllergenEntryRow): AllergenEntry {
  return AllergenEntry.reconstitute({
    id: row.id,
    code: row.code,
    name: readLocalizedColumn(row.name, "allergen_entry.name"),
    categoryId: row.categoryId,
    official: row.official,
    archivedAt: row.archivedAt,
  });
}

/**
 * Les colonnes qu'une catégorie possède, `id` exclu — il ne se réécrit pas, et
 * le trigger d'immuabilité le refuserait sur une ligne officielle.
 */
export function categoryColumns(category: AllergenCategory): {
  readonly key: string;
  readonly name: Record<string, string>;
  readonly incoCategory: string | null;
  readonly official: boolean;
  readonly position: number;
  readonly archivedAt: Date | null;
} {
  const snapshot = category.snapshot();
  return {
    key: snapshot.key,
    name: localizedColumn(snapshot.name),
    incoCategory: snapshot.incoCategory,
    official: snapshot.official,
    position: snapshot.position,
    archivedAt: snapshot.archivedAt,
  };
}

export function entryColumns(entry: AllergenEntry): {
  readonly code: string;
  readonly name: Record<string, string>;
  readonly categoryId: string;
  readonly official: boolean;
  readonly archivedAt: Date | null;
} {
  const snapshot = entry.snapshot();
  return {
    code: snapshot.code,
    name: localizedColumn(snapshot.name),
    categoryId: snapshot.categoryId,
    official: snapshot.official,
    archivedAt: snapshot.archivedAt,
  };
}
