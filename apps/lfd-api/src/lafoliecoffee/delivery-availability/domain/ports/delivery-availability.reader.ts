import type { DeliveryAvailabilityView } from "@lfd/contracts";

/**
 * Port de **lecture** du réglage de livraison.
 *
 * Distinct du port d'écriture (ISP) : la caisse et le devis n'ont besoin que de
 * savoir si la livraison est ouverte, jamais de la poser.
 */
export abstract class DeliveryAvailabilityReader {
  /** Le réglage courant ; aucun geste encore = `DEFAULT_DELIVERY_AVAILABILITY` (ouvert aux deux). */
  abstract current(): Promise<DeliveryAvailabilityView>;
}
