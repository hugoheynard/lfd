import type { OrderOpeningView } from "@lfd/contracts";

/**
 * Port de **lecture** du réglage d'ouverture de la boutique.
 *
 * Distinct du port d'écriture (ISP) : la passation n'a besoin que de savoir si
 * la boutique prend les commandes d'une clientèle, jamais de le poser.
 */
export abstract class OrderOpeningReader {
  /** Le réglage courant ; aucun geste encore = `DEFAULT_ORDER_OPENING` (ouverte aux deux). */
  abstract current(): Promise<OrderOpeningView>;
}
