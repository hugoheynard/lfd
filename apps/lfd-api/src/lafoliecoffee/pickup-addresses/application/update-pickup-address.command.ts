import type { PickupAddressUpdatePayload } from "@lfd/contracts";

/**
 * Commande **staff** : modifier un point de retrait (global).
 * `payload.discounts` absent = les remises restent celles de la base : un
 * onglet ouvert avant elles n'efface rien.
 */
export class UpdatePickupAddressCommand {
  constructor(
    readonly id: string,
    readonly payload: PickupAddressUpdatePayload,
  ) {}
}
