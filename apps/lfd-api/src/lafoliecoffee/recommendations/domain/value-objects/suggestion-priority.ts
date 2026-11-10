import { InvalidSuggestionPriorityError } from "../errors/staff-suggestion-errors.js";

/** La borne haute d'une priorité : assez pour ranger, pas assez pour s'y perdre. */
export const MAX_SUGGESTION_PRIORITY = 999;

/**
 * **La priorité d'une règle** (Q3, Hugo, 2026-10-18) : un entier, plus haut =
 * d'abord, lu seulement quand le réglage de l'ordre est `priority`.
 *
 * @throws {InvalidSuggestionPriorityError} pas un entier, ou hors de 0 à 999.
 */
export function suggestionPriority(raw: number): number {
  if (!Number.isInteger(raw) || raw < 0 || raw > MAX_SUGGESTION_PRIORITY) {
    throw new InvalidSuggestionPriorityError(raw, MAX_SUGGESTION_PRIORITY);
  }
  return raw;
}
