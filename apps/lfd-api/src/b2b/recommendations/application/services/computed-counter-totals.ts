import {
  COMPUTED_SUGGESTION_RESULT_KINDS,
  type ComputedSuggestionResultKind,
  type ProductAudienceCounterView,
  type ProductAudienceEvent,
} from "@lfd/contracts";

import type { SuggestionDayAdds } from "../../domain/services/suggestion-attribution.js";

/** Les chiffres comptés d'un genre du calculé. */
export interface ComputedCounterTotal {
  readonly kind: ComputedSuggestionResultKind;
  readonly shown: number;
  readonly clicked: number;
  readonly added: number;
}

/** Ce que les compteurs `data` disent du calculé : ses totaux, et le détail des ajouts. */
export interface ComputedCounterTally {
  /** Une ligne par genre, dans l'ordre de `COMPUTED_SUGGESTION_RESULT_KINDS`, zéros compris. */
  readonly totals: readonly ComputedCounterTotal[];
  /** Les ajouts, à verser dans le MÊME partage que ceux des règles (RS6). */
  readonly adds: readonly SuggestionDayAdds[];
}

/**
 * L'emplacement écrit par la boutique → le genre chiffré. « Vos habituels »
 * compte sous deux emplacements selon sa raison (`suggestions-calculees.md`
 * §8.3) ; l'écran n'en fait qu'une ligne.
 */
const KIND_OF_PLACEMENT: ReadonlyMap<string, ComputedSuggestionResultKind> = new Map([
  ["bought_with", "bought_with"],
  ["weekly_rhythm", "usuals"],
  ["frequent", "usuals"],
]);

const COLUMN_OF: Partial<Record<ProductAudienceEvent, keyof Omit<ComputedCounterTotal, "kind">>> = {
  suggestion_shown: "shown",
  suggestion_clicked: "clicked",
  suggestion_added: "added",
};

/**
 * La clé d'un genre du calculé dans l'attribution. Le préfixe la tient à
 * l'écart des ids de règle (des ULID, sans `:`).
 */
export function computedClaimant(kind: ComputedSuggestionResultKind): string {
  return `data:${kind}`;
}

/**
 * Rattache les compteurs `data` à leur genre. Un compteur d'une autre source,
 * ou d'un emplacement qu'aucun genre chiffré ne nomme, est ignoré.
 */
export function tallyComputedCounters(
  rows: readonly ProductAudienceCounterView[],
): ComputedCounterTally {
  const totals = new Map(
    COMPUTED_SUGGESTION_RESULT_KINDS.map((kind) => [
      kind,
      { kind, shown: 0, clicked: 0, added: 0 },
    ]),
  );
  const adds: SuggestionDayAdds[] = [];
  for (const row of rows) {
    const column = COLUMN_OF[row.event];
    const kind = KIND_OF_PLACEMENT.get(row.placement);
    const total = kind === undefined ? undefined : totals.get(kind);
    if (row.source !== "data" || column === undefined || total === undefined) {
      continue;
    }
    total[column] += row.count;
    if (column === "added") {
      adds.push({
        claimant: computedClaimant(total.kind),
        day: row.day,
        sku: row.sku,
        added: row.count,
      });
    }
  }
  return { totals: [...totals.values()], adds };
}
