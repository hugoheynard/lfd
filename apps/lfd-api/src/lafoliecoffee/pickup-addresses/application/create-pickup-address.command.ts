import type { PickupAddressPayload } from "@lfd/contracts";

/** Commande **staff** : créer un point de retrait (global). */
export class CreatePickupAddressCommand {
  constructor(
    readonly payload: PickupAddressPayload,
    /** La fiche du staff qui agit : l'acteur de l'intention. */
    readonly staffUserId: string,
    /** La clé d'intention de l'écran (`Idempotency-Key`) : un rejeu ne refait pas le geste. */
    readonly intentKey: string,
  ) {}
}
