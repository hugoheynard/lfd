import type { PickupAddressPayload, PickupAddressUpdatePayload } from "@lfd/contracts";

/** Commandes **staff** de gestion des points de retrait (globaux). */

export class CreatePickupAddressCommand {
  constructor(readonly payload: PickupAddressPayload) {}
}

/**
 * Modifier un point. `payload.discountAudiences` absent = les clientèles restent
 * celles de la base : un onglet ouvert avant leur existence ne rouvre rien.
 */
export class UpdatePickupAddressCommand {
  constructor(
    readonly id: string,
    readonly payload: PickupAddressUpdatePayload,
  ) {}
}

export class RemovePickupAddressCommand {
  constructor(readonly id: string) {}
}

export class SetDefaultPickupAddressCommand {
  constructor(readonly id: string) {}
}
