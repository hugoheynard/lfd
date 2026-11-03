import type { CounterPackingSheetView } from "@lfd/contracts";

import type { CounterPackingSheetSource } from "../ports/counter-packing-sheet.reader.js";
import { awaitingOf } from "./packing-board.js";
import { allocationOf, placedPieces } from "./packing-board-sheet.js";
import { leftToPlace } from "./placement.js";

/**
 * **La fiche du comptoir**, calculée par les règles mêmes du poste
 * (`sheetOf`, `awaitingOf`) : une ligne « pas encore sortie » au comptoir est
 * celle que le colisage ne peut pas poser. Seule différence, la réserve n'est
 * lue que pour les articles de la commande — l'attente d'un SKU ne dépend que
 * de sa propre réserve.
 */
export function counterPackingSheetOf(source: CounterPackingSheetSource): CounterPackingSheetView {
  const { order } = source;
  const awaiting = awaitingOf({ orders: [order], withdrawn: [], stocks: source.stocks });
  const allocatedOf = allocationOf(order);
  return {
    orderId: order.orderId,
    reference: order.reference,
    lineCount: order.lines.length,
    packedLines: order.lines.filter((line) => line.packed !== null).length,
    packedPieces: order.lines.reduce((sum, line) => sum + placedPieces(line, allocatedOf(line)), 0),
    packedAt: order.packed?.at.toISOString() ?? null,
    lines: order.lines.map((line) => {
      const allocated = allocatedOf(line);
      return {
        sku: line.sku,
        quantity: line.quantity,
        packed: line.packed !== null,
        awaitingProduction:
          line.packed === null && awaiting(line.sku, leftToPlace(line.quantity, allocated)),
        allocated,
      };
    }),
  };
}
