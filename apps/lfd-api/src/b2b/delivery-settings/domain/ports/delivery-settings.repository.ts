import type { DeliverySettings } from "../delivery-settings.js";

/** Port d'**écriture** du réglage de livraison : une ligne, remplacée à chaque geste. */
export abstract class DeliverySettingsRepository {
  abstract put(settings: DeliverySettings): Promise<void>;
}
