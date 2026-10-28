import type { SaleUnit } from "@lfd/money";

import type { ShortfallQuantity } from "../entities/order-shortfall.js";

/** Un article de la lettre : son nom sur la commande, et combien. */
export interface ShortfallLetterLine {
  readonly product: string;
  /** Des pièces, ou des grammes si `saleUnit = "weight"`. */
  readonly quantity: number;
  /** Présente pour un article au poids seulement : une lettre à la pièce reste ce qu'elle était. */
  readonly saleUnit?: "weight";
}

/** Ce que la lettre au client dit : ce qui part, ce qui manque. */
export interface ShortfallLetterLines {
  readonly departed: readonly ShortfallLetterLine[];
  readonly missing: readonly ShortfallLetterLine[];
}

/**
 * **Ce qui part et ce qui manque**, par article, depuis le signal décidé (plan
 * plan E6d (`documentation/commandes/bon-de-livraison.md`)) : part ce qui était
 * au bac (la décision n'en fait partir ni plus ni moins), manque la
 * différence avec ce qui était dû. Un article sans nom connu se dit par son
 * SKU plutôt que de disparaître de la lettre.
 */
export function shortfallLetterLines(
  lines: readonly ShortfallQuantity[],
  names: ReadonlyMap<string, string>,
  units: ReadonlyMap<string, SaleUnit> = new Map(),
): ShortfallLetterLines {
  // Au poids, « ce qui manque » est la différence de grammes entre le dû et
  // le lot au bac (P6) : 1 000 g dus, 750 g au bac, 250 g manquent.
  const named = (sku: string, quantity: number): ShortfallLetterLine => ({
    product: names.get(sku) ?? sku,
    quantity,
    ...(units.get(sku) === "weight" ? { saleUnit: "weight" as const } : {}),
  });
  return {
    departed: lines.filter((line) => line.packed > 0).map((line) => named(line.sku, line.packed)),
    missing: lines
      .filter((line) => line.due > line.packed)
      .map((line) => named(line.sku, line.due - line.packed)),
  };
}
