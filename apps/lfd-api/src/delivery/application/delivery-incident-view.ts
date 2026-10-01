import type { DeliveryIncidentView } from "@lfd/contracts";

import type { DeliveryIncidentRow } from "../domain/ports/delivery-incidents.reader.js";

/**
 * Un signalement → sa vue. Le nom figé au geste ; `null` quand l'annuaire
 * n'en connaissait pas — on n'en invente pas. La clé de la photo ne sort
 * jamais : seulement qu'il y en a une.
 */
export function deliveryIncidentView(row: DeliveryIncidentRow): DeliveryIncidentView {
  return {
    id: row.id,
    roundId: row.roundId,
    stopId: row.stopId,
    orderReference: row.orderReference,
    family: row.family,
    reason: row.reason,
    note: row.note,
    hasPhoto: row.hasPhoto,
    reportedAt: row.reportedAt.toISOString(),
    reportedBy: {
      staffUserId: row.reportedBy,
      name: row.reportedByName === "" ? null : row.reportedByName,
    },
  };
}
