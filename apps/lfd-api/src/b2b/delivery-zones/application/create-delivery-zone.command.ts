import type { DeliveryZonePayload } from "@lfd/contracts";

/** Commande **staff** : créer une zone de livraison (globale). */
export class CreateDeliveryZoneCommand {
  constructor(readonly payload: DeliveryZonePayload) {}
}
