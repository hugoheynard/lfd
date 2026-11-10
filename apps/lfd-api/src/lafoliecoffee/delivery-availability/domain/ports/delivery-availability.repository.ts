import type { DeliveryAvailability } from "../delivery-availability.js";

/** Port d'**écriture** du réglage de livraison : une ligne, remplacée à chaque geste. */
export abstract class DeliveryAvailabilityRepository {
  abstract put(settings: DeliveryAvailability): Promise<void>;
}
