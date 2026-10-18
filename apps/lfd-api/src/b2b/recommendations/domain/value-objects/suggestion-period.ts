import { addDays } from "@lfd/contracts";

import {
  InvalidSuggestionDayError,
  SuggestionPeriodReversedError,
} from "../errors/staff-suggestion-errors.js";

const DAY_SHAPE = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * **La période d'une suggestion** : deux jours métier `AAAA-MM-JJ`, bornes
 * comprises, l'un et l'autre obligatoires (§2 du plan). Des jours et non des
 * instants : la boutique dit « cette semaine », et le jour se lit à Paris
 * (`instantToLocal`) au moment d'afficher.
 */
export interface SuggestionPeriod {
  readonly startsOn: string;
  readonly endsOn: string;
}

/**
 * @throws {InvalidSuggestionDayError} un jour mal formé ou qui n'existe pas (un 30 février).
 * @throws {SuggestionPeriodReversedError} la fin précède le début.
 */
export function suggestionPeriod(startsOn: string, endsOn: string): SuggestionPeriod {
  const start = calendarDay("Le premier jour", startsOn);
  const end = calendarDay("Le dernier jour", endsOn);
  // L'ordre ISO est l'ordre du calendrier.
  if (end < start) {
    throw new SuggestionPeriodReversedError(start, end);
  }
  return { startsOn: start, endsOn: end };
}

/** Le jour `day` est-il dans la période, bornes comprises ? */
export function periodCovers(period: SuggestionPeriod, day: string): boolean {
  return period.startsOn <= day && day <= period.endsOn;
}

function calendarDay(field: string, raw: string): string {
  // `addDays(jour, 0)` repasse par le calendrier : un 30 février en ressort
  // 2 mars, et ne se relit donc pas à l'identique.
  if (!DAY_SHAPE.test(raw) || addDays(raw, 0) !== raw) {
    throw new InvalidSuggestionDayError(field, raw);
  }
  return raw;
}
