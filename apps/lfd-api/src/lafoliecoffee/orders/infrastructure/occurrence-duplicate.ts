import { violatedConstraint } from "../../../platform/database/json-columns.js";
import { OccurrenceAlreadyServedError } from "../domain/errors/occurrence-already-served.error.js";
import { PlannedColumnAlreadyServedError } from "../domain/errors/planned-column-already-served.error.js";
import type { OrderProvenance } from "../domain/ports/order.repository.js";

/** L'index unique partiel qui tient « une échéance, au plus une commande ». */
const ONE_ORDER_PER_OCCURRENCE = "orders_one_per_occurrence";
/** L'index unique qui tient « une colonne planifiée, au plus une commande ». */
const ONE_ORDER_PER_PLANNED_COLUMN = "orders_one_per_planned_column";

/**
 * **Une seconde commande pour la même provenance**, reconnue par le NOM de la
 * contrainte : `orders` porte d'autres uniques (le numéro de commande), et un
 * « unicité violée » générique ferait passer un doublon de numéro pour un
 * rejeu. `null` pour toute autre erreur, qui remonte telle quelle.
 */
export function occurrenceDuplicateOf(
  error: unknown,
  provenance: OrderProvenance | undefined,
): OccurrenceAlreadyServedError | PlannedColumnAlreadyServedError | null {
  if (provenance === undefined) {
    return null;
  }
  const constraint = violatedConstraint(error);
  if ("plannedColumnId" in provenance) {
    return constraint === ONE_ORDER_PER_PLANNED_COLUMN
      ? new PlannedColumnAlreadyServedError(provenance.plannedColumnId)
      : null;
  }
  return constraint === ONE_ORDER_PER_OCCURRENCE
    ? new OccurrenceAlreadyServedError(provenance.subscriptionId, provenance.occurrenceDay)
    : null;
}
