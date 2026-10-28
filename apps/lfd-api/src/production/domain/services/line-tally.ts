import { pieceTally, quantityFigure, saleQuantity, type SaleUnit } from "@lfd/money";

/** Une ligne figée réduite à ce que les comptes et les papiers lisent. */
export interface TalliedLine {
  readonly quantity: number;
  readonly saleUnit: SaleUnit;
}

/**
 * **Ce qu'une ligne pèse dans un total de pièces** — un article au poids
 * compte pour une ligne, jamais ses grammes (plan
 * `documentation/pricing/vente-au-poids.md`, § 2). La règle est celle de
 * `pieceTally` ; ce fichier n'en est que l'entrée pour les lignes du fournil.
 */
export function linePieces(line: TalliedLine): number {
  return pieceTally(saleQuantity(line.quantity, line.saleUnit));
}

/** Le total de pièces de lignes figées, une ligne au poids comptant pour un. */
export function piecesOfLines(lines: readonly TalliedLine[]): number {
  return lines.reduce((sum, line) => sum + linePieces(line), 0);
}

/** « 12 » ou « 1,25 kg » : la colonne de quantité d'un papier du fournil. */
export function lineFigure(line: TalliedLine): string {
  return quantityFigure(saleQuantity(line.quantity, line.saleUnit));
}

/**
 * La taille du chiffre de quantité sur un papier : « 1,25 kg » tient dans la
 * colonne d'un « 48 » si on l'écrit plus petit — le nom de l'article commence
 * juste après.
 */
export function figureFontSize(line: TalliedLine, pieceSize: number): number {
  return line.saleUnit === "weight" ? Math.round(pieceSize * WEIGHT_FIGURE_RATIO) : pieceSize;
}

/** « 1000 kg » en gras tient dans 18 mm à 60 % de la taille d'un nombre de pièces. */
const WEIGHT_FIGURE_RATIO = 0.6;
