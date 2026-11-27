import type { PlacedOrder } from "./order.repository.js";

/**
 * **La commande déjà passée pour une colonne planifiée**, relue par sa
 * provenance — ce que la passation rend quand une seconde passation de la
 * même colonne a buté sur l'index unique.
 */
export abstract class PlannedColumnOrderReader {
  abstract orderOf(columnId: string): Promise<PlacedOrder | null>;
}
