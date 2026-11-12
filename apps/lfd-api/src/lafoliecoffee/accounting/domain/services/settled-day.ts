import { localToInstant } from "@lfd/contracts";

import { BillingCycleBoundaryError } from "../errors/accounting-errors.js";

/** Minuit, heure de Paris. */
const MIDNIGHT = "00:00";

/**
 * L'instant où commence le jour (Paris) d'un solde `AAAA-MM-JJ` : celui qui
 * range le bon dans une période du payeur — les clôtures tombent à minuit,
 * et l'assiette prend `settled_on` dans `[début, clôture[` en jours de Paris.
 *
 * @throws {BillingCycleBoundaryError} minuit n'existe pas ce jour-là (jamais à Paris).
 */
export function settledDayStart(settledOn: string): Date {
  const instant = localToInstant(settledOn, MIDNIGHT);
  if (instant === null) {
    throw new BillingCycleBoundaryError(settledOn, MIDNIGHT);
  }
  return instant;
}
