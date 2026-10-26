import { PastServiceDayCompositionError } from "../errors/delivery-round-removal-errors.js";

/**
 * **On ne compose pas une journée passée** (décision de Hugo, 2026-10-26).
 * `today` : le jour de Paris au moment du geste, lu par l'appelant à
 * l'horloge — le domaine ne la lit pas. `AAAA-MM-JJ` : l'ordre des chaînes
 * est celui des jours ; aujourd'hui reste composable.
 *
 * @throws {PastServiceDayCompositionError}
 */
export function ensureServiceDayNotPast(serviceDay: string, today: string): void {
  if (serviceDay < today) {
    throw new PastServiceDayCompositionError(serviceDay);
  }
}
