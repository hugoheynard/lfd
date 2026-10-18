import type {
  ProductAudienceCounterView,
  ProductAudienceEvent,
  StaffSuggestionCountersView,
} from "@lfd/contracts";

import type { RuleDayAdds } from "../../domain/services/suggestion-attribution.js";

/** Le geste compté → la colonne de l'écran. Les vues et ajouts directs n'en sont pas. */
const COLUMN_OF: Partial<
  Record<ProductAudienceEvent, keyof Omit<StaffSuggestionCountersView, "ruleId">>
> = {
  suggestion_shown: "shown",
  suggestion_clicked: "clicked",
  suggestion_added: "added",
};

/** Ce que les compteurs disent des règles : leurs totaux, et le détail des ajouts. */
export interface StaffCounterTally {
  /** Une ligne par règle, dans l'ordre reçu ; des zéros pour une règle jamais comptée. */
  readonly totals: readonly StaffSuggestionCountersView[];
  /** Les ajouts, jour par jour et article par article — la matière de l'attribution (RS6). */
  readonly adds: readonly RuleDayAdds[];
}

/**
 * Rattache les compteurs `staff` à leur règle : l'emplacement d'un geste
 * `staff` est l'id de la règle en minuscules (§6 du plan). Un compteur d'une
 * autre source, ou dont l'emplacement ne nomme aucune règle connue, est
 * ignoré : il ne se rattache à rien.
 */
export function tallyStaffCounters(
  rows: readonly ProductAudienceCounterView[],
  ruleIds: readonly string[],
): StaffCounterTally {
  const totals = new Map(
    ruleIds.map((ruleId) => [ruleId.toLowerCase(), { ruleId, shown: 0, clicked: 0, added: 0 }]),
  );
  const adds: RuleDayAdds[] = [];
  for (const row of rows) {
    const column = COLUMN_OF[row.event];
    const total = totals.get(row.placement);
    if (row.source !== "staff" || column === undefined || total === undefined) {
      continue;
    }
    total[column] += row.count;
    if (column === "added") {
      adds.push({ ruleId: total.ruleId, day: row.day, sku: row.sku, added: row.count });
    }
  }
  return { totals: [...totals.values()], adds };
}
