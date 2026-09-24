/**
 * La grille d'une page de vitrine — ce qui peut s'y poser, et où.
 *
 * Fonctions PURES : aucune dépendance Angular, aucun effet. L'éditeur les
 * appelle ; c'est ici que vit la règle « deux objets ne se chevauchent jamais,
 * aucun ne déborde des 5 colonnes ni des R rangées »
 * (`documentation/order/boutique-rayon-layout.md`, « Composer une page »).
 *
 * ⚠️ État LOCAL seulement : aucun modèle serveur n'existe encore. Le jour où il
 * existera, le serveur refusera la même chose à l'écriture ; ce fichier ne
 * sera alors que le refus anticipé, pas l'autorité.
 *
 * L'image vit dans `storefront-media.ts`, le défilement dans
 * `storefront-carousel.ts`, la pile dans `storefront-mobile.ts`.
 *
 * Positions 1-indexées, tailles en colonnes × rangées (cas de bureau).
 */

import type { CarouselSettings, ContentsMode } from './storefront-carousel';
import type { MediaFit, MediaSide, Tone } from './storefront-media';

/** La grille de bureau fait 5 colonnes au plus. */
export const GRID_COLUMNS = 5;
/** La « limite par page » : bornes du champ « Rangées par page ». */
export const MIN_ROWS = 1;
export const MAX_ROWS = 12;
export const DEFAULT_ROWS = 6;

/**
 * Une FORME, et rien d'autre (Hugo, 2026-09-24 : « on pourrait très bien
 * avoir un produit en 2×2 »). Le contenu — produit ou info — s'associera plus
 * tard sur n'importe quelle forme ; le modèle local n'en porte donc aucune
 * trace, pas même un champ réservé, pour ne rien présumer de sa forme.
 *
 * `hero` est ici une FORME de la grille (3×2), pas le rôle d'image « Ouverture » de la médiathèque. */
export type StorefrontShape =
  'card' | 'kakemono' | 'tile' | 'block' | 'hero' | 'band' | 'doubleBand';

export interface FormatSpec {
  readonly format: StorefrontShape;
  readonly label: string;
  readonly columns: number;
  readonly rows: number;
  /** La taille en pile (< 900 px, 2 colonnes) — colonne « Pile » du document. */
  readonly mobileColumns: number;
  readonly mobileRows: number;
}

/** Une ligne de la table : bureau (colonnes × rangées), puis pile. */
function shape(
  format: StorefrontShape,
  label: string,
  [columns, rows]: readonly [number, number],
  [mobileColumns, mobileRows]: readonly [number, number],
): FormatSpec {
  return { format, label, columns, rows, mobileColumns, mobileRows };
}

/** La table des formes du document (« Composer une page »), dans l'ordre de la palette. */
export const FORMATS: readonly FormatSpec[] = [
  shape('card', 'Carte', [1, 1], [1, 1]),
  shape('kakemono', 'Kakémono', [1, 2], [1, 2]),
  shape('tile', 'Tuile', [2, 1], [2, 1]),
  shape('block', 'Bloc', [2, 2], [2, 2]),
  shape('hero', 'Hero', [3, 2], [2, 2]),
  shape('band', 'Bande simple', [5, 1], [2, 1]),
  shape('doubleBand', 'Bande double', [5, 2], [2, 2]),
];

export interface Cell {
  readonly column: number;
  readonly row: number;
}

/**
 * Un rayon, par sa clé. La liste vient d'une doublure locale
 * (`storefront-shelves.ts`) tant que le catalogue ne la sert pas.
 */
export type ShelfKey = string;

/** Un objet posé. Le contenu (SKU, annonce) viendra au mapping : il peut exister vide. */
export interface PlacedBlock extends Cell {
  readonly id: string;
  readonly format: StorefrontShape;
  /**
   * « Appliquer en mobile » (Hugo, 2026-09-24) : oui → la taille « Pile » de
   * la table ; non → réduit à une carte 1×1. Absent = oui.
   */
  readonly applyOnMobile?: boolean;
  /** Absent = `cover`. L'image se règle sur l'objet, pas sur le contenu. */
  readonly mediaFit?: MediaFit;
  /** Absent = le défaut de la forme. Toujours parmi les côtés permis de sa forme (`storefront-media.ts`). */
  readonly mediaSide?: MediaSide;
  /** Absent = `light`. */
  readonly tone?: Tone;
  /** Absent = `single`. */
  readonly contents?: ContentsMode;
  /**
   * Les réglages du défilement. CONSERVÉS quand l'objet repasse à un seul
   * contenu, mais inactifs : revenir à plusieurs retrouve ce qu'on avait réglé.
   */
  readonly carousel?: CarouselSettings;
  /**
   * Les rayons où il paraît — un, plusieurs ou tous —, à la MÊME position sur
   * chacun. Jamais vide. Un tableau plutôt qu'un `Set` : l'état vit dans un
   * signal, et un `Set` muté en place ne notifierait personne.
   */
  readonly shelves: readonly ShelfKey[];
}

export type PlacementRefusal =
  | { readonly reason: 'outside' }
  | { readonly reason: 'columns' }
  | { readonly reason: 'rows' }
  | { readonly reason: 'noShelf' }
  | { readonly reason: 'overlap'; readonly blocker: PlacedBlock; readonly shelf: ShelfKey };

export type PlacementVerdict = { readonly ok: true } | ({ readonly ok: false } & PlacementRefusal);

export type PlacementResult =
  | { readonly ok: true; readonly blocks: readonly PlacedBlock[] }
  | ({ readonly ok: false } & PlacementRefusal);

export function formatSpec(format: StorefrontShape): FormatSpec {
  const spec = FORMATS.find((candidate) => candidate.format === format);
  if (spec === undefined) {
    throw new RangeError(`Format inconnu : ${format}`);
  }
  return spec;
}

/** « Tuile 2×1 » — le nom et la taille, tels que l'écran les montre. */
export function describeFormat(format: StorefrontShape): string {
  const spec = formatSpec(format);
  return `${spec.label} ${spec.columns}×${spec.rows}`;
}

/** Dernière colonne / dernière rangée couvertes par un objet. */
function lastColumn(block: PlacedBlock): number {
  return block.column + formatSpec(block.format).columns - 1;
}

function lastRow(block: PlacedBlock): number {
  return block.row + formatSpec(block.format).rows - 1;
}

export function overlaps(a: PlacedBlock, b: PlacedBlock): boolean {
  return (
    a.column <= lastColumn(b) &&
    b.column <= lastColumn(a) &&
    a.row <= lastRow(b) &&
    b.row <= lastRow(a)
  );
}

/**
 * Le candidat tient-il sur une grille de `rows` rangées, parmi `blocks` ?
 * Un objet de même `id` que le candidat est ignoré : c'est lui qu'on déplace.
 */
export function checkPlacement(
  blocks: readonly PlacedBlock[],
  rows: number,
  candidate: PlacedBlock,
): PlacementVerdict {
  if (candidate.column < 1 || candidate.row < 1) {
    return { ok: false, reason: 'outside' };
  }
  if (lastColumn(candidate) > GRID_COLUMNS) {
    return { ok: false, reason: 'columns' };
  }
  if (lastRow(candidate) > rows) {
    return { ok: false, reason: 'rows' };
  }
  if (candidate.shelves.length === 0) {
    return { ok: false, reason: 'noShelf' };
  }
  // Sur CHAQUE rayon du candidat : un objet partagé tient partout ou nulle part.
  for (const shelf of candidate.shelves) {
    const blocker = readingOrder(onShelf(blocks, shelf)).find(
      (block) => block.id !== candidate.id && overlaps(block, candidate),
    );
    if (blocker !== undefined) {
      return { ok: false, reason: 'overlap', blocker, shelf };
    }
  }
  return { ok: true };
}

/** Les objets qui paraissent sur un rayon. */
export function onShelf(blocks: readonly PlacedBlock[], shelf: ShelfKey): readonly PlacedBlock[] {
  return blocks.filter((block) => block.shelves.includes(shelf));
}

/**
 * Change les rayons d'un objet, à position inchangée. Refusé si la place est
 * prise sur un des rayons ajoutés (le refus nomme le rayon et l'objet), ou si
 * la liste est vide. Les doublons sont ignorés.
 */
export function setShelves(
  blocks: readonly PlacedBlock[],
  rows: number,
  id: string,
  shelves: readonly ShelfKey[],
): PlacementResult {
  const block = blocks.find((candidate) => candidate.id === id);
  if (block === undefined) {
    return { ok: true, blocks };
  }
  return place(blocks, rows, { ...block, shelves: [...new Set(shelves)] });
}

/** Pose (ou repose, même `id`) le candidat s'il tient. */
export function place(
  blocks: readonly PlacedBlock[],
  rows: number,
  candidate: PlacedBlock,
): PlacementResult {
  const verdict = checkPlacement(blocks, rows, candidate);
  if (!verdict.ok) {
    return verdict;
  }
  const exists = blocks.some((block) => block.id === candidate.id);
  return {
    ok: true,
    blocks: exists
      ? blocks.map((block) => (block.id === candidate.id ? candidate : block))
      : [...blocks, candidate],
  };
}

/** Décale un objet posé d'un pas (la voie clavier). Un `id` inconnu ne change rien. */
export function moveBy(
  blocks: readonly PlacedBlock[],
  rows: number,
  id: string,
  deltaColumn: number,
  deltaRow: number,
): PlacementResult {
  const block = blocks.find((candidate) => candidate.id === id);
  if (block === undefined) {
    return { ok: true, blocks };
  }
  return place(blocks, rows, {
    ...block,
    column: block.column + deltaColumn,
    row: block.row + deltaRow,
  });
}

export function removeBlock(blocks: readonly PlacedBlock[], id: string): readonly PlacedBlock[] {
  return blocks.filter((block) => block.id !== id);
}

/**
 * Peut-on réduire la page à `rows` rangées ? Non si un objet déborde : on rend
 * le PREMIER dans l'ordre de lecture, pour que le refus le nomme.
 */
export function checkRowLimit(
  blocks: readonly PlacedBlock[],
  rows: number,
): { readonly ok: true } | { readonly ok: false; readonly blocker: PlacedBlock } {
  const blocker = readingOrder(blocks).find((block) => lastRow(block) > rows);
  return blocker === undefined ? { ok: true } : { ok: false, blocker };
}

/** Rangée, puis colonne — l'ordre dont la pile se déduira. */
export function readingOrder(blocks: readonly PlacedBlock[]): readonly PlacedBlock[] {
  return [...blocks].sort((a, b) => a.row - b.row || a.column - b.column);
}

/**
 * Les cases qu'aucun objet ne couvre, en ordre de lecture (rangée, puis
 * colonne). Décidé par Hugo le 2026-09-24 : elles se remplissent avec le reste
 * du rayon, dans l'ordre du catalogue — la N-ième case libre reçoit le N-ième
 * article restant.
 */
export function freeCells(blocks: readonly PlacedBlock[], rows: number): readonly Cell[] {
  const free: Cell[] = [];
  for (let row = 1; row <= rows; row++) {
    for (let column = 1; column <= GRID_COLUMNS; column++) {
      const probe: PlacedBlock = { id: '', format: 'card', column, row, shelves: [] };
      if (!blocks.some((block) => overlaps(block, probe))) {
        free.push({ column, row });
      }
    }
  }
  return free;
}

/** La première case (ordre de lecture) où `format` tient, ou `null` si la page est pleine. */
export function firstFreeCell(
  blocks: readonly PlacedBlock[],
  rows: number,
  format: StorefrontShape,
  shelves: readonly ShelfKey[],
): Cell | null {
  for (let row = 1; row <= rows; row++) {
    for (let column = 1; column <= GRID_COLUMNS; column++) {
      if (checkPlacement(blocks, rows, { id: '', format, column, row, shelves }).ok) {
        return { column, row };
      }
    }
  }
  return null;
}

/** Le texte d'un refus, pour une personne qui n'a pas la grille en tête. */
export function refusalMessage(
  refusal: PlacementRefusal,
  rows: number,
  shelfLabel: (shelf: ShelfKey) => string,
): string {
  switch (refusal.reason) {
    case 'outside':
      return 'Hors de la grille.';
    case 'columns':
      return `Déborde des ${GRID_COLUMNS} colonnes.`;
    case 'rows':
      return `Déborde des ${rows} rangées de la page.`;
    case 'noShelf':
      return 'Un objet paraît sur au moins un rayon.';
    case 'overlap':
      return (
        `Sur le rayon « ${shelfLabel(refusal.shelf)} », chevauche « ${describeFormat(refusal.blocker.format)} » ` +
        `posé en colonne ${refusal.blocker.column}, rangée ${refusal.blocker.row}.`
      );
  }
}
