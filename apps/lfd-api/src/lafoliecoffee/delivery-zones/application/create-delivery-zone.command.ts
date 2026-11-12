import type { DeliveryZonePayload } from "@lfd/contracts";

/** Commande **staff** : créer une zone de livraison (globale). */
export class CreateDeliveryZoneCommand {
  constructor(
    readonly payload: DeliveryZonePayload,
    /** La fiche du staff qui agit : l'acteur de l'intention. */
    readonly staffUserId: string,
    /** La clé d'intention de l'écran (`Idempotency-Key`) : un rejeu ne refait pas le geste. */
    readonly intentKey: string,
  ) {}
}
