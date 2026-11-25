import type { DeliveryNotesBornReader } from "../../../channels/commerce/index.js";
import type { ProductionDay } from "../../../day/index.js";
import { DossierAwaitsDeliveryNotesError } from "../../domain/errors/dossier-delivery-notes-errors.js";
import { closedSnapshotOf } from "../services/production-paper-slots.js";

/**
 * **Le dossier ne part pas sans tous ses BL.** Lève tant qu'une commande de
 * la journée figée n'a pas son BL vivant : la livraison du fait échoue et la
 * garde la rejoue, le temps que l'abonné du commerce les fasse naître.
 *
 * @throws {DossierAwaitsDeliveryNotesError} au moins une commande sans BL.
 */
export async function ensureDeliveryNotesBorn(
  notes: DeliveryNotesBornReader,
  day: ProductionDay,
): Promise<void> {
  const orderIds = closedSnapshotOf(day).orders.map((order) => order.orderId);
  const missing = await notes.withoutNote(orderIds);
  if (missing.length > 0) {
    throw new DossierAwaitsDeliveryNotesError(day.day.value, missing.length);
  }
}
