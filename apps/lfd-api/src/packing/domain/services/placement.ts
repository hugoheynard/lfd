import type { ContainerMode, SheetLine } from "../entities/packing-sheet.snapshot.js";

/**
 * **Ce qui reste à poser, et ce qui manque pour le poser** — la SEULE règle
 * que lisent le badge « En attente de la prod », le compteur « Marchandise à
 * répartir », la fiche et les deux refus serveur (`OrderContents.allocate`,
 * `PackingStock.take`).
 *
 * Pourquoi une seule fonction : le 2026-10-05, 18 croissants déposés sur une
 * ligne ouverte de 38 étaient retirés du libre (la réserve les compte au bac)
 * mais encore comptés dans ce que la ligne attendait — l'écran annonçait un
 * manque que le serveur n'aurait pas refusé, et la fiche ignorait les 18
 * posés. Trois calculs voisins avaient divergé ; un seul ne le peut pas.
 *
 * Pures, sans dépendance : le domaine les appelle, l'écran en reçoit le
 * résultat.
 */

/** Ce qu'un contenant vivant porte, réduit à ce que la règle lit. */
export interface HeldLine {
  readonly sku: string;
  readonly quantity: number;
}

/**
 * Les pièces d'une ligne déjà posées. `listed` : la somme sur les contenants
 * VIVANTS ; `counted` (journées colisées avec l'ancien poste) : la quantité si
 * la ligne est cochée, sinon zéro — l'ancien poste ne connaissait que le tout
 * ou rien.
 */
export function allocatedOnLine(
  mode: ContainerMode,
  line: SheetLine,
  containers: readonly { readonly lines: readonly HeldLine[] }[],
): number {
  if (mode !== "listed") {
    return line.packed === null ? 0 : line.quantity;
  }
  return containers.reduce(
    (sum, container) =>
      sum + (container.lines.find((held) => held.sku === line.sku)?.quantity ?? 0),
    0,
  );
}

/** Le reste à poser d'une ligne : dû − posé, jamais négatif. */
export function leftToPlace(quantity: number, allocated: number): number {
  return Math.max(0, quantity - allocated);
}

/**
 * Combien il manque au libre pour poser `wanted` pièces — `0` si le libre
 * suffit, et `0` quand il n'y a rien à poser. Un libre négatif (réserve en
 * dette) manque d'autant.
 */
export function shortfall(free: number, wanted: number): number {
  return wanted <= 0 ? 0 : Math.max(0, wanted - free);
}
