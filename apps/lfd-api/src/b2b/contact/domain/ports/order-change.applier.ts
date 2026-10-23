import type { RequestedOrderChange } from "../customer-request-details.js";

/**
 * Port d'**écriture** : appliquer une modification demandée — c'est une
 * RÉVISION de la commande au nom de l'équipe (plan
 * `documentation/commandes/plan-modifier-une-commande.md`, M4, R1 staff), par
 * le même geste que « Modifier la commande » au back-office, qui rejuge tout
 * sous verrou : inscrite au plan entre-temps, modifiée ailleurs (R7), carte…
 * Ses refus remontent tels quels, avec leur phrase.
 */
export abstract class OrderChangeApplier {
  /** Rend la révision produite. */
  abstract apply(
    orderId: string,
    staffUserId: string,
    baseRevision: number,
    change: RequestedOrderChange,
  ): Promise<number>;
}
