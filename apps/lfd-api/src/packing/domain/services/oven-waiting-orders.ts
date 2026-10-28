import type { PackingBoardDay } from "../ports/packing-board.reader.js";
import { awaitingOf } from "./packing-board.js";
import { allocationOf } from "./packing-board-sheet.js";
import { leftToPlace } from "./placement.js";
import { compareReadyBy, type LocalDeparture, readyByOf } from "./ready-by.js";

/** Les commandes d'un SKU qui attendent le four. */
export interface WaitingOrdersOfSku {
  /** Commandes distinctes, ≥ 1 — un reliquat ne compte pas deux fois sa commande. */
  readonly count: number;
  /** La plus proche heure « prête pour », `HH:mm` ; `null` = aucune connue. */
  readonly earliestHandover: string | null;
}

/**
 * **Ce qui attend le four, SKU par SKU** (plan `fournil/plan-fournee-v3.md`,
 * §3) — fonction pure.
 *
 * La règle est celle de la Supervision, ligne pour ligne (`linesOf` de
 * `packing-board-sheet.ts`) : une ligne ouverte attend le four quand son
 * reste à poser dépasse le libre de la réserve (`awaitingOf`). L'heure est
 * celle par laquelle le poste range ses bacs (`readyByOf`) : le départ de la
 * tournée ou du transfert, sinon l'échéance figée par le fournil.
 */
export function ovenWaitingOrdersOf(
  date: string,
  day: PackingBoardDay,
  departures: ReadonlyMap<string, LocalDeparture>,
): ReadonlyMap<string, WaitingOrdersOfSku> {
  const awaiting = awaitingOf(day);
  const orders = new Map<string, Map<string, string | null>>();
  for (const order of day.orders) {
    const allocatedOf = allocationOf(order);
    const time = readyByOf(order, departures.get(order.orderId), date).time;
    for (const line of order.lines) {
      const toPlace = leftToPlace(line.quantity, allocatedOf(line));
      if (line.packed === null && awaiting(line.sku, toPlace)) {
        const bySku = orders.get(line.sku) ?? new Map<string, string | null>();
        bySku.set(order.orderId, earliest(bySku.get(order.orderId), time));
        orders.set(line.sku, bySku);
      }
    }
  }
  return new Map(
    [...orders.entries()].map(([sku, times]) => [
      sku,
      {
        count: times.size,
        earliestHandover: [...times.values()].reduce<string | null>(
          (first, time) => (compareReadyBy(time, first) < 0 ? time : first),
          null,
        ),
      },
    ]),
  );
}

/** La plus tôt des deux ; `undefined` = pas encore vue. */
function earliest(seen: string | null | undefined, time: string | null): string | null {
  if (seen === undefined) {
    return time;
  }
  return compareReadyBy(time, seen) < 0 ? time : seen;
}
