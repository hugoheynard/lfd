import { weightLabel } from "@lfd/money";

import { fill } from "./copy/mail-copy.js";

/**
 * **Le contenu d'une commande en une phrase** : le nombre de pièces, puis
 * chaque ligne au poids avec son poids (« Saumon gravlax, 500 g ») — un poids
 * n'est pas un nombre de pièces (`vente-au-poids.md`, P3). Une commande
 * à la pièce se dit exactement comme avant.
 */
export function contentOf(
  lines: readonly {
    readonly productName: string;
    readonly quantity: number;
    readonly saleUnit?: "weight";
  }[],
  texts: { readonly pieces: string; readonly weighed: string },
): string {
  const weighed = lines.filter((line) => line.saleUnit === "weight");
  const pieces = lines
    .filter((line) => line.saleUnit !== "weight")
    .reduce((sum, line) => sum + line.quantity, 0);
  const parts = [
    ...(weighed.length === 0 || pieces > 0 ? [fill(texts.pieces, { count: String(pieces) })] : []),
    ...weighed.map((line) =>
      fill(texts.weighed, { name: line.productName, weight: weightLabel(line.quantity) }),
    ),
  ];
  return parts.join(" · ");
}
