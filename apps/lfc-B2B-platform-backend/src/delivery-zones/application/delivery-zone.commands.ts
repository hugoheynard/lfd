import type { DeliveryZonePayload } from "@lfd/contracts";

/** Commandes **staff** de gestion des zones de livraison (globales). */

export class CreateDeliveryZoneCommand {
  constructor(readonly payload: DeliveryZonePayload) {}
}

export class UpdateDeliveryZoneCommand {
  constructor(
    readonly id: string,
    readonly payload: DeliveryZonePayload,
  ) {}
}

export class RemoveDeliveryZoneCommand {
  constructor(readonly id: string) {}
}
