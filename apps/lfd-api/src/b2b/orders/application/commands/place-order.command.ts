import type { OrderPaymentIntent, PlaceOrderPayload } from "@lfd/contracts";

/**
 * Passe une commande pour le client `actorUserId`. L'entreprise éventuelle est
 * **dans le payload** (`companyId`, ou `null` = commande personnelle) : le mur
 * (membre) ne s'applique que si une entreprise est visée ; sinon, seul l'acteur
 * connecté possède la commande. Jamais déduit du corps autrement que par ce champ.
 */
export class PlaceOrderCommand {
  constructor(
    readonly actorUserId: string,
    readonly payload: PlaceOrderPayload,
  ) {}
}

/**
 * Résultat de la passation : la commande créée, plus — quand une **carte** est
 * requise (pas d'entreprise, ou entreprise non active / `per_order`) et un total
 * > 0 — l'intention de paiement à régler. `payment` absent = facturé sur terme
 * différé (entreprise active), rien à encaisser au checkout.
 */
export interface PlaceOrderResult {
  readonly id: string;
  readonly orderNumber: string;
  readonly payment?: OrderPaymentIntent;
}
