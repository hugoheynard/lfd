import type { DeliveryPricing } from "../delivery-pricing.js";

/** Port d'**écriture** du réglage global de livraison : une ligne, remplacée à chaque geste. */
export abstract class DeliveryPricingRepository {
  abstract put(pricing: DeliveryPricing): Promise<void>;
}
