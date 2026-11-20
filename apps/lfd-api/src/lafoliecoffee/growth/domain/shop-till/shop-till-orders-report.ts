import type { ShopTillOrdersDay } from "@lfd/contracts";

import { dayNumberOf } from "../made-to-order/made-to-order-period.js";
import { ShopTillOrdersReportPeriodError } from "../errors/shop-till-orders-report-errors.js";

/**
 * **La période du rapport** : deux jours de retrait, bornes comprises, au plus
 * `maxDays` jours. Refuse un jour impossible, une fin avant le début, une
 * période trop longue.
 */
export class ShopTillOrdersPeriod {
  private constructor(
    readonly from: string,
    readonly to: string,
  ) {}

  static of(from: string, to: string, maxDays: number): ShopTillOrdersPeriod {
    const start = dayNumberOf(from);
    const end = dayNumberOf(to);
    if (start === null || end === null) {
      throw new ShopTillOrdersReportPeriodError(
        `Le jour ${start === null ? from : to} n'existe pas : saisissez une date au format AAAA-MM-JJ.`,
      );
    }
    if (end < start) {
      throw new ShopTillOrdersReportPeriodError(
        `La période finit le ${to}, avant son début le ${from} : inversez les deux dates.`,
      );
    }
    if (end - start + 1 > maxDays) {
      throw new ShopTillOrdersReportPeriodError(
        `La période du ${from} au ${to} dépasse ${String(maxDays)} jours : raccourcissez-la.`,
      );
    }
    return new ShopTillOrdersPeriod(from, to);
  }
}

/** Une commande à régler en boutique, telle que le rapport la range. */
export interface ShopTillOrderEntry {
  /** Le jour de retrait, `AAAA-MM-JJ`. */
  readonly day: string;
  readonly siteId: string | null;
  readonly pickupLabel: string | null;
  /** Le TTC commandé — jamais un montant encaissé. */
  readonly totalCents: number;
  /** Remise au client (`fulfilled`). */
  readonly handedOver: boolean;
  /** Le client n'est pas venu la retirer (`no_show`). */
  readonly notCollected: boolean;
}

/** La clé d'une ligne : un jour, un point (le site, à défaut son nom). */
function keyOf(entry: ShopTillOrderEntry): string {
  return `${entry.day}|${entry.siteId ?? ""}|${entry.pickupLabel ?? ""}`;
}

/**
 * **Les commandes à régler en boutique, par jour et par point de retrait** —
 * le montant commandé, la part remise, et la part non retirée. Par jour croissant, puis par nom de
 * point.
 */
export function shopTillOrdersRowsOf(
  entries: readonly ShopTillOrderEntry[],
): readonly ShopTillOrdersDay[] {
  const rows = new Map<string, ShopTillOrdersDay>();
  for (const entry of entries) {
    const key = keyOf(entry);
    const row = rows.get(key) ?? emptyRowOf(entry);
    rows.set(key, {
      ...row,
      orderedTtcCents: row.orderedTtcCents + entry.totalCents,
      orderedCount: row.orderedCount + 1,
      handedOverTtcCents: row.handedOverTtcCents + (entry.handedOver ? entry.totalCents : 0),
      handedOverCount: row.handedOverCount + (entry.handedOver ? 1 : 0),
      notCollectedTtcCents: row.notCollectedTtcCents + (entry.notCollected ? entry.totalCents : 0),
      notCollectedCount: row.notCollectedCount + (entry.notCollected ? 1 : 0),
    });
  }
  return [...rows.values()].sort(
    (a, b) =>
      a.day.localeCompare(b.day) || (a.pickupLabel ?? "").localeCompare(b.pickupLabel ?? ""),
  );
}

function emptyRowOf(entry: ShopTillOrderEntry): ShopTillOrdersDay {
  return {
    day: entry.day,
    siteId: entry.siteId,
    pickupLabel: entry.pickupLabel,
    orderedTtcCents: 0,
    orderedCount: 0,
    handedOverTtcCents: 0,
    handedOverCount: 0,
    notCollectedTtcCents: 0,
    notCollectedCount: 0,
  };
}
