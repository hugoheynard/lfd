import type { PickupAddressPayload } from "@lfd/contracts";

/** Commande **staff** : créer un point de retrait (global). */
export class CreatePickupAddressCommand {
  constructor(readonly payload: PickupAddressPayload) {}
}
