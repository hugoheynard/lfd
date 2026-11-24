import type { IsoDate } from "../../domain/value-objects/iso-date.js";
import { parisDay } from "./paris-day.js";

/** Les écrans montrent les quatre semaines passées d'un panier, en plus de celles à venir. */
export const PAST_OCCURRENCE_DAYS = 28;

/** Le premier jour de service que les écrans des paniers montrent, à cet instant. */
export function occurrenceWindowStart(now: Date): IsoDate {
  return parisDay(now).plusDays(-PAST_OCCURRENCE_DAYS);
}
