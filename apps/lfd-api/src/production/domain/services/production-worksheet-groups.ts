import {
  CATALOG_CATEGORY_LABELS,
  CATALOG_CATEGORY_ORDER,
  SHELF_LABEL_OFF_CATALOG,
  SHELF_LABEL_UNKNOWN,
  UNSHELVED_WORKSHOP_GROUP_KEY,
  type CatalogCategory,
} from "@lfd/contracts";

import type { WorksheetLine } from "./production-worksheet.js";

/**
 * **Les fiches d'une journée, une par rayon** — et tout ce qu'elles comptent.
 *
 * Une fonction pure, comme `worksheetOf` dont elle reprend la sortie : le
 * handler lit les rayons au commerce et les lui passe. C'est ce qui rend le
 * rangement et les compteurs éprouvables sans Nest ni base.
 *
 * Décidé le 2026-09-14 : l'écran n'additionne rien et ne filtre rien. Deux
 * calculs du même « reste à sortir », l'un au serveur et l'autre au poste,
 * finiraient par diverger le matin où l'on en a besoin.
 */

/** Une fiche, dans le vocabulaire du domaine (instants en `Date`). */
export interface WorksheetGroup {
  /** La catégorie, ou `UNSHELVED_WORKSHOP_GROUP_KEY`. */
  readonly key: string;
  readonly category: CatalogCategory | null;
  readonly label: string;
  readonly lineCount: number;
  /** Les lignes de `pending` — servi pour que l'écran ne compte rien. */
  readonly pendingCount: number;
  readonly doneCount: number;
  readonly totalUnits: number;
  readonly remainingUnits: number;
  readonly doneUnits: number;
  readonly pending: readonly WorksheetLine[];
  readonly done: readonly WorksheetLine[];
}

/**
 * Range les lignes par rayon.
 *
 * ## Les deux ordres
 *
 * Les fiches suivent **la vitrine** (`CATALOG_CATEGORY_ORDER`) : c'est l'ordre
 * dans lequel tout le back-office montre les rayons, et un fournil qui passe
 * d'un écran à l'autre ne doit pas les chercher. Le groupe sans rayon ferme la
 * marche — il est l'anomalie, pas le travail du jour.
 *
 * Les lignes **gardent l'ordre reçu** : `worksheetOf` a déjà trié (le plus gros
 * d'abord). Retrier ici ferait deux règles pour un seul ordre.
 *
 * ## Le groupe sans rayon, et ses deux libellés
 *
 * `shelves: null` = la lecture a ÉCHOUÉ. Tout va alors dans « Rayon inconnu »,
 * et surtout pas « Hors catalogue », qui affirmerait que le fournil fabrique des
 * articles retirés de la vente. Une table lue mais sans ce SKU, elle, dit bien
 * « Hors catalogue ».
 *
 * Aucun groupe vide : un onglet « 0 ligne » est un onglet qu'on ouvre pour rien.
 */
export function worksheetGroupsOf(
  lines: readonly WorksheetLine[],
  shelves: ReadonlyMap<string, CatalogCategory> | null,
): readonly WorksheetGroup[] {
  const byShelf = new Map<CatalogCategory, WorksheetLine[]>();
  const unshelved: WorksheetLine[] = [];
  for (const line of lines) {
    const shelf = shelves?.get(line.sku);
    if (shelf === undefined) {
      unshelved.push(line);
      continue;
    }
    const bucket = byShelf.get(shelf) ?? [];
    bucket.push(line);
    byShelf.set(shelf, bucket);
  }
  const groups = CATALOG_CATEGORY_ORDER.flatMap((category) => {
    const bucket = byShelf.get(category);
    return bucket === undefined
      ? []
      : [groupOf(category, category, CATALOG_CATEGORY_LABELS[category], bucket)];
  });
  if (unshelved.length === 0) {
    return groups;
  }
  const label = shelves === null ? SHELF_LABEL_UNKNOWN : SHELF_LABEL_OFF_CATALOG;
  return [...groups, groupOf(UNSHELVED_WORKSHOP_GROUP_KEY, null, label, unshelved)];
}

/** Une fiche et ses compteurs — les deux listes dans l'ordre reçu. */
function groupOf(
  key: string,
  category: CatalogCategory | null,
  label: string,
  lines: readonly WorksheetLine[],
): WorksheetGroup {
  const pending = lines.filter((line) => !line.done);
  const done = lines.filter((line) => line.done);
  const totalUnits = unitsOf(lines);
  const doneUnits = unitsOf(done);
  return {
    key,
    category,
    label,
    lineCount: lines.length,
    pendingCount: pending.length,
    doneCount: done.length,
    totalUnits,
    remainingUnits: totalUnits - doneUnits,
    doneUnits,
    pending,
    done,
  };
}

function unitsOf(lines: readonly WorksheetLine[]): number {
  return lines.reduce((total, line) => total + line.quantity, 0);
}
