import type { OrderStatus } from "@lfd/contracts";

/**
 * **Le verrou que le retrait prend sur la commande avant de l'attester**
 * (`documentation/commandes/annulation/annulation-par-le-staff.md`, C3.6 —
 * course remise × annulation, fermée le 2026-10-25).
 *
 * Le retrait DÉCLARE, le commerce implémente : la ligne `orders` est au
 * commerce, et c'est la même que l'annulation verrouille en premier
 * (`verrous-de-l-annulation.md`). Les deux gestes se suivent donc, ils ne se
 * croisent plus : celui qui arrive second relit sous le verrou ce que le
 * premier a écrit, et refuse.
 *
 * Rejoint la transaction de l'appelant : hors unité de travail, le verrou
 * serait relâché à la fin de sa propre requête et ne protégerait rien.
 */
export abstract class HandoverOrderLock {
  /**
   * Verrouille la commande (`FOR UPDATE`) et rend son état relu sous le
   * verrou, ou `null` si elle n'existe pas.
   */
  abstract lockForHandover(orderId: string): Promise<OrderStatus | null>;
}
