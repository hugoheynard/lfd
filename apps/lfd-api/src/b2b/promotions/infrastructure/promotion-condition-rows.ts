import type { Weekday } from "@lfd/contracts";

import { isJsonRecord } from "../../../platform/database/json-columns.js";
import type { PromotionCondition } from "../domain/promotion-condition.js";
import type {
  PromotionHoursWindow,
  PromotionWeeklyHours,
} from "../domain/promotion-weekly-hours.js";

/**
 * **Les conditions d'une promotion, JSON ↔ domaine** — la colonne `jsonb`
 * `promotions.conditions`, et la copie figée des jours et heures sur une
 * remise de commande (`order_discounts.weekly_hours`). Une seule lecture :
 * deux traductions de la même forme finiraient par en accepter deux.
 *
 * La lecture ne JUGE pas (l'agrégat revalide, `assertWeeklyHours`) : elle
 * refuse seulement une forme inconnue.
 */

/** Une plage, telle qu'elle s'écrit. */
export type HoursWindowRow = {
  readonly weekdays: readonly string[];
  readonly start: string;
  readonly end: string;
};

/** Les jours et heures, tels qu'ils s'écrivent. */
export type WeeklyHoursRow = {
  readonly kind: "weekly_hours";
  readonly moment: string;
  readonly announceOutside: boolean;
  readonly windows: readonly HoursWindowRow[];
};

/** Une condition, telle qu'elle s'écrit. */
export type PromotionConditionRow =
  { readonly kind: "min_quantity"; readonly value: number } | WeeklyHoursRow;

const WEEKDAYS: readonly Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function conditionRowOf(condition: PromotionCondition): PromotionConditionRow {
  return condition.kind === "min_quantity"
    ? { kind: condition.kind, value: condition.value }
    : weeklyHoursRowOf(condition);
}

export function weeklyHoursRowOf(hours: PromotionWeeklyHours): WeeklyHoursRow {
  return {
    kind: "weekly_hours",
    moment: hours.moment,
    announceOutside: hours.announceOutside,
    windows: hours.windows.map((window) => ({
      weekdays: [...window.weekdays],
      start: window.start,
      end: window.end,
    })),
  };
}

/** Une condition relue ; `null` = forme inconnue (l'appelant nomme le refus). */
export function conditionFromJson(entry: unknown): PromotionCondition | null {
  if (!isJsonRecord(entry)) {
    return null;
  }
  if (entry["kind"] === "min_quantity" && typeof entry["value"] === "number") {
    return { kind: "min_quantity", value: entry["value"] };
  }
  return weeklyHoursFromJson(entry);
}

/** Les jours et heures relus ; `null` = forme inconnue. */
export function weeklyHoursFromJson(entry: unknown): PromotionWeeklyHours | null {
  if (
    !isJsonRecord(entry) ||
    entry["kind"] !== "weekly_hours" ||
    (entry["moment"] !== "ordered_at" && entry["moment"] !== "handover_at") ||
    typeof entry["announceOutside"] !== "boolean" ||
    !Array.isArray(entry["windows"])
  ) {
    return null;
  }
  const windows = entry["windows"].map(windowFromJson);
  if (windows.some((window) => window === null)) {
    return null;
  }
  return {
    kind: "weekly_hours",
    moment: entry["moment"],
    announceOutside: entry["announceOutside"],
    windows: windows.filter((window): window is PromotionHoursWindow => window !== null),
  };
}

function windowFromJson(entry: unknown): PromotionHoursWindow | null {
  if (
    !isJsonRecord(entry) ||
    typeof entry["start"] !== "string" ||
    typeof entry["end"] !== "string" ||
    !Array.isArray(entry["weekdays"])
  ) {
    return null;
  }
  const weekdays = entry["weekdays"].map((raw: unknown) => WEEKDAYS.find((known) => known === raw));
  if (weekdays.some((day) => day === undefined)) {
    return null;
  }
  return {
    weekdays: weekdays.filter((day): day is Weekday => day !== undefined),
    start: entry["start"],
    end: entry["end"],
  };
}
