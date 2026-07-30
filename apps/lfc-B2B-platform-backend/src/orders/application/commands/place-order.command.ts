import type { PlaceOrderPayload } from "@lfd/contracts";

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
