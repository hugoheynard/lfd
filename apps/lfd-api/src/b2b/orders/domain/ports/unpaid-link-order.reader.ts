/** Une commande saisie par l'équipe, réglée par lien, et toujours pas encaissée. */
export interface UnpaidLinkOrder {
  readonly orderId: string;
  readonly orderNumber: string;
  /** L'enseigne, à défaut la raison sociale ; `null` sans société. */
  readonly companyName: string | null;
  /** Le jour de retrait (`AAAA-MM-JJ`), ou `null` — aucun n'a été demandé. */
  readonly serviceDay: string | null;
  readonly placedAt: Date;
}

/**
 * Port de **lecture** du rappel de règlement (plan
 * `documentation/order/plan-abandon-du-reglement.md`, Q6) : les commandes que
 * l'équipe a saisies avec un lien de paiement (`placedByStaffId` posé, une
 * intention Stripe), encore `placed`, dont le règlement est en attente ou
 * refusé.
 *
 * Étroit par construction (ISP) : la passe ne lit rien d'autre, et elle
 * n'écrit rien sur la commande.
 */
export abstract class UnpaidLinkOrderReader {
  abstract awaitingSettlement(): Promise<readonly UnpaidLinkOrder[]>;
}
