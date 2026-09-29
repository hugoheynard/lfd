import type { LoadDeliveryBinPayload } from "@lfd/contracts";

/**
 * Charger un bac dans une tournée — par son QR (`binId`) ou son code tapé.
 * Acte **staff** : `staffUserId` est écrit dans la ligne de chargement.
 */
export class LoadDeliveryBinCommand {
  constructor(
    readonly roundId: string,
    readonly payload: LoadDeliveryBinPayload,
    readonly staffUserId: string,
  ) {}
}
