import type { SheetLine } from "../entities/packing-sheet.snapshot.js";

/**
 * Une ligne due, figée au signalement d'un manque (lot E6a) : ce que la
 * commande attend, et ce qui est **réellement au bac** à cet instant.
 */
export interface ShortfallLine {
  readonly sku: string;
  readonly productName: string;
  readonly due: number;
  /** Les pièces réparties dans les contenants vivants, bornées à la quantité due. */
  readonly packed: number;
}

/**
 * **Ce qui est au bac, ligne par ligne** — ou `null` si rien ne manque : chaque
 * ligne due est entièrement répartie. Toutes les lignes sont rendues, complètes
 * comprises : la décision d'E6b part de la commande entière, pas des seuls
 * écarts.
 */
export function shortfallOf(
  lines: readonly SheetLine[],
  allocatedOf: (sku: string) => number,
): readonly ShortfallLine[] | null {
  const counted = lines.map((line) => ({
    sku: line.sku,
    productName: line.productName,
    due: line.quantity,
    packed: Math.min(allocatedOf(line.sku), line.quantity),
  }));
  return counted.some((line) => line.packed < line.due) ? counted : null;
}
