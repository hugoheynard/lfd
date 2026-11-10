import type { DeliveryZonePayload } from "@lfd/contracts";

/** Commande **staff** : modifier une zone de livraison (globale). */
export class UpdateDeliveryZoneCommand {
  constructor(
    readonly id: string,
    readonly payload: DeliveryZonePayload,
  ) {}
}
