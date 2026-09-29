import type { LoadDeliveryBagPayload } from "@lfd/contracts";

/**
 * Charger un sac dans une tournée — par son QR (`bagId`) ou son code tapé.
 * Acte **staff** : `staffUserId` est écrit dans la ligne de chargement.
 */
export class LoadDeliveryBagCommand {
  constructor(
    readonly roundId: string,
    readonly payload: LoadDeliveryBagPayload,
    readonly staffUserId: string,
  ) {}
}
