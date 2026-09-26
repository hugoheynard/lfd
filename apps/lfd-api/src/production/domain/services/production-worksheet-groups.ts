import {
  SHELF_LABEL_OFF_CATALOG,
  SHELF_LABEL_UNKNOWN,
  UNSHELVED_WORKSHOP_GROUP_KEY,
  type CatalogFamilyView,
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
  /** L'id de la famille, ou `UNSHELVED_WORKSHOP_GROUP_KEY`. */
  readonly key: string;
  readonly family: CatalogFamilyView | null;
  /** Déprécié au contrat, servi toujours à `null` (cf. `WorkshopGroup.category`). */
  readonly category: null;
  readonly label: string;
  readonly lineCount: number;
  readonly doneCount: number;
  readonly totalUnits: number;
  readonly remainingUnits: number;
  readonly doneUnits: number;
  /** Toutes les lignes, dans l'ordre reçu. */
  readonly lines: readonly WorksheetLine[];
  readonly pending: readonly WorksheetLine[];
  readonly done: readonly WorksheetLine[];
}

/**
 * Range les lignes par rayon.
 *
 * ## Les deux ordres
 *
 * Les fiches suivent **le référentiel** — la position de la famille, puis son
 * nom : c'est l'ordre dans lequel tout le back-office montre les rayons, et un
 * fournil qui passe d'un écran à l'autre ne doit pas les chercher. Aucune liste
 * de rayons ici : une famille livrée par le PIM a sa fiche sans déploiement. Le groupe sans rayon ferme la
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
  shelves: ReadonlyMap<string, CatalogFamilyView> | null,
): readonly WorksheetGroup[] {
  const byFamily = new Map<string, { family: CatalogFamilyView; lines: WorksheetLine[] }>();
  const unshelved: WorksheetLine[] = [];
  for (const line of lines) {
    const family = shelves?.get(line.sku);
    if (family === undefined) {
      unshelved.push(line);
      continue;
    }
    const bucket = byFamily.get(family.id);
    if (bucket === undefined) {
      byFamily.set(family.id, { family, lines: [line] });
    } else {
      bucket.lines.push(line);
    }
  }
  const groups = [...byFamily.values()]
    .sort((left, right) => byPositionThenName(left.family, right.family))
    .map((bucket) => groupOf(bucket.family.id, bucket.family, bucket.family.name, bucket.lines));
  if (unshelved.length === 0) {
    return groups;
  }
  const label = shelves === null ? SHELF_LABEL_UNKNOWN : SHELF_LABEL_OFF_CATALOG;
  return [...groups, groupOf(UNSHELVED_WORKSHOP_GROUP_KEY, null, label, unshelved)];
}

/** Position, puis nom, puis id : deux homonymes restent chacun d'un bloc. */
function byPositionThenName(left: CatalogFamilyView, right: CatalogFamilyView): number {
  const delta = left.position - right.position;
  if (delta !== 0) {
    return delta;
  }
  const byName = left.name.localeCompare(right.name, "fr");
  return byName !== 0 ? byName : left.id.localeCompare(right.id);
}

/** Une fiche et ses compteurs — les deux listes dans l'ordre reçu. */
function groupOf(
  key: string,
  family: CatalogFamilyView | null,
  label: string,
  lines: readonly WorksheetLine[],
): WorksheetGroup {
  const pending = lines.filter((line) => !line.done);
  const done = lines.filter((line) => line.done);
  const totalUnits = unitsOf(lines);
  const doneUnits = unitsOf(done);
  return {
    key,
    family,
    category: null,
    label,
    lineCount: lines.length,
    doneCount: done.length,
    totalUnits,
    remainingUnits: totalUnits - doneUnits,
    doneUnits,
    lines,
    pending,
    done,
  };
}

function unitsOf(lines: readonly WorksheetLine[]): number {
  return lines.reduce((total, line) => total + line.quantity, 0);
}
