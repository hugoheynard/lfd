import type { CatalogFamilyView, WorkshopGroupKind, WorkshopLineRole } from "@lfd/contracts";

import { linePieces } from "../../../shared/print/index.js";
import {
  groupingOf,
  sectionOrdered,
  type GroupingSource,
  type ProductionGroup,
} from "../../../shared/print/index.js";
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
  /** L'id de la famille, `ws:<id>` pour un poste, ou `UNSHELVED_WORKSHOP_GROUP_KEY`. */
  readonly key: string;
  /** Le rayon racine ; `null` pour un poste, le hors catalogue ou des rayons illisibles. */
  readonly family: CatalogFamilyView | null;
  readonly kind: WorkshopGroupKind;
  readonly workstation: ProductionGroup<WorksheetLine>["workstation"];
  /** En mode prod, des lignes sans poste — « à ranger ». */
  readonly unplaced: boolean;
  /** Déprécié au contrat, servi toujours à `null` (cf. `WorkshopGroup.category`). */
  readonly category: null;
  readonly label: string;
  /**
   * Les compteurs de CETTE fiche : sa charge. En mode prod, une ligne à
   * plusieurs postes compte dans chacune de leurs fiches (plan
   * `documentation/fournil/plan-produit-sur-plusieurs-postes.md`, § 2.7) ;
   * les additionner d'une fiche à l'autre compterait deux fois la ligne.
   */
  readonly lineCount: number;
  readonly doneCount: number;
  readonly totalUnits: number;
  readonly remainingUnits: number;
  readonly doneUnits: number;
  /** Toutes les lignes, dans l'ordre reçu. */
  readonly lines: readonly WorksheetLine[];
  readonly pending: readonly WorksheetLine[];
  readonly done: readonly WorksheetLine[];
  /** Ses sous-catégories, seulement si le réglage les affiche. */
  readonly sections?: readonly WorksheetSection[];
  /** SKU → ce que le poste fait de la ligne ; vide hors d'une fiche de poste. */
  readonly roles: ReadonlyMap<string, WorkshopLineRole>;
}

/** Une sous-catégorie d'une fiche ; `key: null` = la racine elle-même. */
export interface WorksheetSection {
  readonly key: string | null;
  readonly label: string | null;
  readonly skus: readonly string[];
}

/**
 * Range les lignes par rayon — la catégorie RACINE depuis le 2026-10-30.
 *
 * ## Les deux ordres
 *
 * Les fiches suivent **le référentiel** — la position de la racine, puis son
 * nom : c'est l'ordre dans lequel tout le back-office montre les rayons, et un
 * fournil qui passe d'un écran à l'autre ne doit pas les chercher. Aucune liste
 * de rayons ici : une famille livrée par le PIM a sa fiche sans déploiement. Le groupe sans rayon ferme la
 * marche — il est l'anomalie, pas le travail du jour.
 *
 * Une sous-catégorie (« Viennoiserie fine ») n'a PAS sa fiche : elle tombe
 * dans celle de sa racine (« Viennoiserie »). Avec `showSubcategories`, la
 * fiche porte ses `sections` et ses lignes sont rangées section par section ;
 * sans, elles **gardent l'ordre reçu** : `worksheetOf` a déjà trié (le plus
 * gros d'abord). Retrier ici ferait deux règles pour un seul ordre.
 *
 * ## Le groupe sans rayon, et ses deux libellés
 *
 * `shelves: null` = la lecture a ÉCHOUÉ. Tout va alors dans « Rayon inconnu »,
 * et surtout pas « Hors catalogue », qui affirmerait que ces articles sont
 * absents du catalogue. Une table lue mais sans ce SKU, elle, dit bien
 * « Hors catalogue » : le SKU est absent du miroir — un article masqué,
 * réservé ou retiré y garde son rayon.
 *
 * Aucun groupe vide : un onglet « 0 ligne » est un onglet qu'on ouvre pour rien.
 */
export function worksheetGroupsOf(
  lines: readonly WorksheetLine[],
  shelves: ReadonlyMap<string, CatalogFamilyView> | null,
  showSubcategories = false,
): readonly WorksheetGroup[] {
  return worksheetGroupsFrom(lines, { mode: "shelf", shelves }, showSubcategories);
}

/**
 * Range les lignes dans le mode du réglage (plan
 * `documentation/fournil/les-postes-du-fournil.md`, § 3.4) : par rayon comme
 * {@link worksheetGroupsOf}, ou par poste — un poste prend la place d'un
 * rayon, et ses intertitres sont les rayons d'où viennent ses lignes.
 */
export function worksheetGroupsFrom(
  lines: readonly WorksheetLine[],
  source: GroupingSource,
  showSubcategories = false,
): readonly WorksheetGroup[] {
  return groupingOf(lines, (line) => line.sku, source).map((group) =>
    worksheetGroupOf(group, showSubcategories),
  );
}

function worksheetGroupOf(
  group: ProductionGroup<WorksheetLine>,
  showSubcategories: boolean,
): WorksheetGroup {
  const head = {
    key: group.key,
    family: group.shelf === null ? null : { ...group.shelf },
    kind: group.kind,
    workstation: group.workstation,
    unplaced: group.unplaced,
    label: group.title,
    roles: group.roles,
  };
  if (!showSubcategories || group.kind === "off_catalog") {
    return groupOf(head, group.lines);
  }
  // L'ordre reçu, section par section : `sort` est stable, un comparateur nul le garde.
  const ordered = sectionOrdered(group.sections, () => 0);
  return { ...groupOf(head, ordered), sections: group.sections.map(sectionOf) };
}

function sectionOf(section: ProductionGroup<WorksheetLine>["sections"][number]): WorksheetSection {
  return {
    key: section.family?.id ?? null,
    label: section.family?.name ?? null,
    skus: section.items.map((line) => line.sku),
  };
}

type GroupHead = Pick<
  WorksheetGroup,
  "key" | "family" | "kind" | "workstation" | "unplaced" | "label" | "roles"
>;

/** Une fiche et ses compteurs — les deux listes dans l'ordre reçu. */
function groupOf(head: GroupHead, lines: readonly WorksheetLine[]): WorksheetGroup {
  const pending = lines.filter((line) => !line.done);
  const done = lines.filter((line) => line.done);
  const totalUnits = unitsOf(lines);
  // Σ min(produced, quantity) (§4 des fournées) : une ligne commencée compte
  // ce qui est sorti, et le surplus ne gonfle pas l'avancement.
  const doneUnits = lines.reduce((total, line) => total + doneUnitsOf(line), 0);
  return {
    ...head,
    category: null,
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

/**
 * Les compteurs d'une fiche additionnent des articles différents : une ligne
 * au poids y pèse une pièce, jamais ses grammes (P6 de
 * `pricing/vente-au-poids.md`).
 */
function unitsOf(lines: readonly WorksheetLine[]): number {
  return lines.reduce((total, line) => total + linePieces(line), 0);
}

/** Au poids, la pièce que pèse la ligne n'est faite que quand tout son poids est sorti. */
function doneUnitsOf(line: WorksheetLine): number {
  if (line.saleUnit === "weight") {
    return line.produced >= line.quantity ? linePieces(line) : 0;
  }
  return Math.min(line.produced, line.quantity);
}
