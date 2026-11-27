import type {
  PlannedColumnView,
  PlannedDayView,
  PlannedLineCheckView,
  WishlistItemView,
} from "@lfd/contracts";

import type {
  PlannedBasketCheckItem,
  PlannedLineCheck,
} from "../../../channels/commerce/planned-basket-check.js";
import type { IsoDate } from "../../../basket/domain/value-objects/iso-date.js";

/** Ce qui décide des jours affichés. */
export interface PlannerGridInput {
  readonly from: IsoDate;
  readonly today: IsoDate;
  readonly last: IsoDate;
  readonly columns: readonly PlannedColumnView[];
}

/**
 * Les colonnes que l'écran montre : un brouillon d'un jour passé disparaît
 * (il n'a pas été converti, et ce n'est pas un refus, § 3.3) ; une issue
 * reste lisible.
 */
export function visibleColumns(
  columns: readonly PlannedColumnView[],
  today: IsoDate,
): PlannedColumnView[] {
  return columns.filter((column) => column.status !== "draft" || column.day >= today.value);
}

/**
 * Les jours affichés : le jour de départ (s'il est encore planifiable), puis
 * chaque jour qui a une colonne en brouillon. Triés, sans doublon.
 */
export function shownDays(input: PlannerGridInput): string[] {
  const start = input.from.isBefore(input.today) ? input.today : input.from;
  const shown = new Set<string>();
  if (!start.isAfter(input.last)) {
    shown.add(start.value);
  }
  for (const column of input.columns) {
    if (column.status === "draft" && column.day >= input.today.value) {
      shown.add(column.day);
    }
  }
  return [...shown].sort();
}

/** Les colonnes groupées par jour, dans l'ordre des jours puis des créneaux lus. */
export function groupByDay(columns: readonly PlannedColumnView[]): PlannedDayView[] {
  const days = new Map<string, PlannedColumnView[]>();
  for (const column of columns) {
    days.set(column.day, [...(days.get(column.day) ?? []), column]);
  }
  return [...days.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([day, dayColumns]) => ({ day, columns: dayColumns }));
}

/**
 * La grille à vérifier (§ 4 bis) : chaque ligne d'une colonne en brouillon
 * d'un jour affiché, par colonne ; et chaque article de la liste d'envies,
 * pour chaque jour affiché.
 */
export function gridItems(
  shown: readonly string[],
  columns: readonly PlannedColumnView[],
  wishlist: readonly WishlistItemView[],
): PlannedBasketCheckItem[] {
  const items: PlannedBasketCheckItem[] = [];
  for (const day of shown) {
    for (const column of columns) {
      if (column.day === day && column.status === "draft") {
        column.lines.forEach((line) => items.push({ sku: line.sku, day, columnId: column.id }));
      }
    }
    wishlist.forEach((item) => items.push({ sku: item.sku, day, columnId: null }));
  }
  return items;
}

/** Une réponse du commerce, telle que l'écran la lit. */
export function checkView(check: PlannedLineCheck): PlannedLineCheckView {
  return {
    sku: check.sku,
    day: check.day,
    columnId: check.columnId,
    closesAt: check.closesAt === null ? null : check.closesAt.toISOString(),
    blocking: check.blocking,
    quantityIndependent: check.quantityIndependent,
  };
}
