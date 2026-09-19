import type { PickupAddressUpdatePayload } from "@lfd/contracts";

/**
 * Commande **staff** : modifier un point de retrait (global).
 * `payload.discountAudiences` absent = les clientèles restent celles de la
 * base : un onglet ouvert avant leur existence ne rouvre rien.
 */
export class UpdatePickupAddressCommand {
  constructor(
    readonly id: string,
    readonly payload: PickupAddressUpdatePayload,
  ) {}
}
