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

/** Une quantité autorisée à partir, par article (E6b). */
export interface AuthorizedLine {
  readonly sku: string;
  readonly quantity: number;
}

/**
 * **Les lignes dues réduites au départ décidé** (E6b, plan E6 § 13) — ou
 * `null` si le bac n'est plus celui du signal : un article au bac en d'autres
 * quantités, un article décidé absent de la fiche, une ligne de la fiche que
 * la décision ne nomme pas.
 */
export function authorizedLinesOf(
  lines: readonly SheetLine[],
  authorized: readonly AuthorizedLine[],
  allocatedOf: (sku: string) => number,
): readonly SheetLine[] | null {
  const bySku = new Map(authorized.map((line) => [line.sku, line.quantity]));
  if (bySku.size !== lines.length || authorized.length !== lines.length) {
    return null;
  }
  const reduced: SheetLine[] = [];
  for (const line of lines) {
    const quantity = bySku.get(line.sku);
    if (quantity === undefined || quantity !== allocatedOf(line.sku) || quantity > line.quantity) {
      return null;
    }
    reduced.push({ ...line, quantity });
  }
  return reduced;
}
