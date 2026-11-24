import { violatedConstraint } from "../../../platform/database/json-columns.js";
import { OccurrenceAlreadyServedError } from "../domain/errors/occurrence-already-served.error.js";
import type { RecurringProvenance } from "../domain/ports/order.repository.js";

/** L'index unique partiel qui tient « une échéance, au plus une commande ». */
const ONE_ORDER_PER_OCCURRENCE = "orders_one_per_occurrence";

/**
 * **Une seconde commande pour la même échéance**, reconnue par le NOM de la
 * contrainte : `orders` porte d'autres uniques (le numéro de commande), et un
 * « unicité violée » générique ferait passer un doublon de numéro pour un
 * rejeu. `null` pour toute autre erreur, qui remonte telle quelle.
 */
export function occurrenceDuplicateOf(
  error: unknown,
  recurring: RecurringProvenance | undefined,
): OccurrenceAlreadyServedError | null {
  if (recurring === undefined || violatedConstraint(error) !== ONE_ORDER_PER_OCCURRENCE) {
    return null;
  }
  return new OccurrenceAlreadyServedError(recurring.subscriptionId, recurring.occurrenceDay);
}
