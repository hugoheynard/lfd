import type { DeliveryPricingView } from "@lfd/contracts";

/**
 * Port de **lecture** du réglage global de livraison par audience (plan
 * `plan-livraison-offerte.md`, sous-lot 0a). Distinct du port d'écriture
 * (ISP) : le calcul du frais le lira (0b), il ne le pose jamais.
 */
export abstract class DeliveryPricingReader {
  /** Le réglage courant ; ligne absente = `DEFAULT_DELIVERY_PRICING` (rien de réglé). */
  abstract current(): Promise<DeliveryPricingView>;
}
