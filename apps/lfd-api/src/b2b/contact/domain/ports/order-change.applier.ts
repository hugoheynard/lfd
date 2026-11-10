import type { RequestedOrderChange } from "../customer-request-details.js";

/**
 * Ce que la révision a produit : son numéro et les deux totaux TTC (centimes)
 * qu'elle a elle-même calculés — le courriel au client les cite tels quels,
 * sans les recalculer à côté.
 */
export interface AppliedOrderChange {
  readonly revision: number;
  readonly totalCents: number;
  readonly previousTotalCents: number;
}

/**
 * Port d'**écriture** : appliquer une modification demandée — c'est une
 * RÉVISION de la commande au nom de l'équipe (voir
 * `documentation/commandes/modification/modifier-une-commande.md`, § 2.5 « La demande après l'heure limite » (M4)), par
 * le même geste que « Modifier la commande » au back-office, qui rejuge tout
 * sous verrou : inscrite au plan entre-temps, modifiée ailleurs (R7), carte…
 * Ses refus remontent tels quels, avec leur phrase.
 */
export abstract class OrderChangeApplier {
  /**
   * Rend la révision produite et ses totaux. `expectedTotalCents` est le TTC
   * que l'équipe a vu au devis (doc `modifier-une-commande.md`, §2.3 (R14)) : un écart
   * refuse, et l'adaptateur ne le recalcule jamais.
   */
  abstract apply(
    orderId: string,
    staffUserId: string,
    baseRevision: number,
    change: RequestedOrderChange,
    expectedTotalCents: number,
  ): Promise<AppliedOrderChange>;
}
