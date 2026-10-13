import type { CustomerCancellationSettingsView } from "@lfd/contracts";

/**
 * Port de **lecture** du réglage « les particuliers peuvent annuler
 * eux-mêmes » (plan `documentation/commandes/annulation/plan-annulation-de-commande.md`,
 * C6.5). Distinct du port d'écriture (ISP) : l'annulation par le client le
 * lit, elle ne le pose jamais.
 */
export abstract class CustomerCancellationSettingsReader {
  /** Le réglage courant ; ligne absente = `DEFAULT_CUSTOMER_CANCELLATION_SETTINGS` (fermé). */
  abstract current(): Promise<CustomerCancellationSettingsView>;
}
