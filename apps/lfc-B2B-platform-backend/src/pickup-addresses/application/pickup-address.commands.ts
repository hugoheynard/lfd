import type { PickupAddressPayload } from "@lfd/contracts";

/** Commandes **staff** de gestion des points de retrait (globaux). */

export class CreatePickupAddressCommand {
  constructor(readonly payload: PickupAddressPayload) {}
}

export class UpdatePickupAddressCommand {
  constructor(
    readonly id: string,
    readonly payload: PickupAddressPayload,
  ) {}
}

export class RemovePickupAddressCommand {
  constructor(readonly id: string) {}
}

export class SetDefaultPickupAddressCommand {
  constructor(readonly id: string) {}
}
