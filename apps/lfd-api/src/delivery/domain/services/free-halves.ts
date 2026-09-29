import type { BinRow, LoadingStopRow } from "../ports/delivery-loading.reader.js";
import { type BinHalf, otherHalf } from "../value-objects/bin-declaration.js";

/** Une moitié libre, et l'arrêt qui la porte. */
export interface FreeHalfRow {
  readonly bin: BinRow;
  readonly stop: LoadingStopRow;
  /** Le côté qu'un partage prendrait. */
  readonly freeHalf: BinHalf;
}

/**
 * **Les moitiés libres autour d'une commande** (lot 4 bis, v2-4) — pure.
 *
 * `stops` sont les arrêts VIVANTS d'une tournée non partie, dans l'ordre de
 * passage : consécutif veut dire « rang voisin », la définition de
 * `areConsecutive`. Une moitié est libre quand elle n'est pas annulée, que son
 * type est en service (v2-7 : un type archivé n'est plus proposé) et qu'AUCUNE
 * autre moitié vivante de la tournée ne partage son bac physique — à une autre
 * commande (`partner`) ou à la même.
 *
 * Une moitié libre à un arrêt NON consécutif n'est pas proposée : le partage
 * serait refusé (`SharedBinNotAdjacentError`).
 */
export function freeHalvesAround(
  stops: readonly LoadingStopRow[],
  orderId: string,
): readonly FreeHalfRow[] {
  const rank = stops.findIndex((stop) => stop.orderId === orderId);
  if (rank < 0) {
    return [];
  }
  const taken = halvesPerPhysicalBin(stops);
  const neighbours = [stops[rank - 1], stops[rank + 1]].filter(
    (stop): stop is LoadingStopRow => stop !== undefined,
  );
  const found: FreeHalfRow[] = [];
  for (const stop of neighbours) {
    for (const bin of stop.bins) {
      if (isFreeHalf(bin, taken) && bin.half !== null) {
        found.push({ bin, stop, freeHalf: otherHalf(bin.half) });
      }
    }
  }
  return found;
}

function isFreeHalf(bin: BinRow, taken: ReadonlyMap<string, number>): boolean {
  return (
    bin.voidedAt === null &&
    bin.half !== null &&
    bin.physicalBinId !== null &&
    bin.partner === null &&
    !bin.binType.archived &&
    taken.get(bin.physicalBinId) === 1
  );
}

/** Combien de moitiés vivantes chaque bac physique porte, dans la tournée. */
function halvesPerPhysicalBin(stops: readonly LoadingStopRow[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const stop of stops) {
    for (const bin of stop.bins) {
      if (bin.voidedAt === null && bin.physicalBinId !== null) {
        counts.set(bin.physicalBinId, (counts.get(bin.physicalBinId) ?? 0) + 1);
      }
    }
  }
  return counts;
}
