import type { PlacedOrder } from "./order.repository.js";

/**
 * **La commande déjà passée pour une échéance**, relue par sa provenance
 * (panier, jour de l'échéance) — ce que la passation rend quand une seconde
 * passation de la même échéance a buté sur l'index unique.
 */
export abstract class OccurrenceOrderReader {
  abstract orderOf(basketId: string, occurrenceDay: string): Promise<PlacedOrder | null>;
}
