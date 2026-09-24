/**
 * La pile (< 900 px, 2 colonnes) — elle se DÉDUIT de la grille de bureau,
 * elle ne se compose pas. Fonctions pures, sans dépendance.
 */

import {
  type Cell,
  formatSpec,
  freeCells,
  type PlacedBlock,
  type StorefrontShape,
} from "./grid.js";

/** La pile fait 2 colonnes, fixes. */
export const MOBILE_COLUMNS = 2;

/** Un format 1×1 n'a pas l'option « Appliquer en mobile » : il n'a rien à réduire. */
export function hasMobileOption(format: StorefrontShape): boolean {
  const spec = formatSpec(format);
  return spec.columns * spec.rows > 1;
}

export interface MobileFormat {
  readonly format: StorefrontShape;
  readonly columns: number;
  readonly rows: number;
}

/** Le format d'un objet en pile. */
export function mobileFormat(block: PlacedBlock): MobileFormat {
  const spec = formatSpec(block.format);
  const applied = block.applyOnMobile !== false || !hasMobileOption(block.format);
  const shown = applied ? spec : formatSpec("card");
  return { format: shown.format, columns: shown.mobileColumns, rows: shown.mobileRows };
}

export type MobileItem<B extends PlacedBlock = PlacedBlock> =
  | { readonly type: "block"; readonly block: B; readonly mobile: MobileFormat }
  | { readonly type: "free"; readonly cell: Cell };

/**
 * La pile se DÉDUIT : objets et cases libres (« article du rayon ») pris en
 * ordre de lecture du bureau, chaque objet traduit par la table des formats.
 * La grille de 2 colonnes les range ensuite (`dense`, comme la boutique).
 */
export function mobileSequence<B extends PlacedBlock>(
  blocks: readonly B[],
  rows: number,
): readonly MobileItem<B>[] {
  const items: { readonly at: Cell; readonly item: MobileItem<B> }[] = [
    ...blocks.map((block) => ({
      at: block,
      item: { type: "block", block, mobile: mobileFormat(block) } as const,
    })),
    ...freeCells(blocks, rows).map((cell) => ({ at: cell, item: { type: "free", cell } as const })),
  ];
  return items
    .sort((a, b) => a.at.row - b.at.row || a.at.column - b.at.column)
    .map(({ item }) => item);
}

/** Change l'option « Appliquer en mobile » — sans effet sur un format 1×1. */
export function setApplyOnMobile<B extends PlacedBlock>(
  blocks: readonly B[],
  id: string,
  applyOnMobile: boolean,
): readonly B[] {
  return blocks.map((block) =>
    block.id === id && hasMobileOption(block.format) ? { ...block, applyOnMobile } : block,
  );
}
