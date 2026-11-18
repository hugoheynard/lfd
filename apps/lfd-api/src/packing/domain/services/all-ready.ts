import type { SaleUnit } from "@lfd/money";

import type { SheetLine } from "../entities/packing-sheet.snapshot.js";
import type { BoardOrder } from "../ports/packing-board.reader.js";
import type { Awaiting } from "./packing-board-sheet.js";
import { allocatedOnLine, leftToPlace, shortfall } from "./placement.js";

/** Un produit dont la réserve libre ne couvre pas ce qui reste à mettre au sac. */
export interface AllReadyShortage {
  readonly sku: string;
  readonly productName: string;
  readonly saleUnit: SaleUnit;
  /** Ce qu'il manque au libre, dans l'unité de la ligne. */
  readonly missing: number;
}

/**
 * **Ce qui empêche « Tout est prêt »** (plan des niveaux de suivi du
 * colisage, D4) : par ligne, le reste à mettre au sac (dû − posé) que le
 * libre de la réserve ne couvre pas — la règle de `PackingStock.take`
 * (`shortfall`). Le libre exclut déjà le manquant mis de côté et les pièces
 * réservées. Vide : tout est arrivé.
 *
 * Lue par le geste, sous les verrous des réserves, et par le poste
 * (`allReadyAvailable`) : le bouton que l'écran grise est celui que le
 * serveur refuserait.
 */
export function allReadyShortages(
  lines: readonly SheetLine[],
  allocatedOf: (line: SheetLine) => number,
  freeOf: (sku: string) => number,
): readonly AllReadyShortage[] {
  return lines.flatMap((line) => {
    const missing = shortfall(freeOf(line.sku), leftToPlace(line.quantity, allocatedOf(line)));
    return missing > 0
      ? [{ sku: line.sku, productName: line.productName, saleUnit: line.saleUnit, missing }]
      : [];
  });
}

/**
 * **« Tout est prêt » a-t-il tout ce qu'il lui faut ?** (D4) — lu par le
 * poste. Une fiche ouverte, rangée en contenants, dont chaque reste à mettre
 * au sac est couvert par le libre de la réserve : la règle de
 * {@link allReadyShortages}, que le geste applique sous verrou. Ne dit rien
 * du niveau de suivi : l'écran ne montre le bouton qu'au retrait simple.
 */
export function allReadyAvailable(order: BoardOrder, awaiting: Awaiting): boolean {
  if (order.containerMode !== "listed" || order.packed !== null || order.lines.length === 0) {
    return false;
  }
  return order.lines.every(
    (line) =>
      !awaiting(
        line.sku,
        leftToPlace(line.quantity, allocatedOnLine(order.containerMode, line, order.containerList)),
      ),
  );
}
