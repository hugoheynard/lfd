import type { OrderPaymentIntent, PlaceOrderPayload } from "@lfd/contracts";

/**
 * Passe une commande pour une entreprise. `actorUserId` accompagne `companyId` :
 * le mur (membre) et le droit de commander (entreprise activée) se vérifient
 * contre cet acteur, jamais contre le corps de la requête.
 */
export class PlaceOrderCommand {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
    readonly payload: PlaceOrderPayload,
  ) {}
}

/**
 * Résultat de la passation : la commande créée, plus — seulement pour une société
 * `per_order` avec un total > 0 — l'intention de paiement à régler par carte.
 * `payment` absent = terme différé (facturé hors ligne), rien à encaisser.
 */
export interface PlaceOrderResult {
  readonly id: string;
  readonly orderNumber: string;
  readonly payment?: OrderPaymentIntent;
}
