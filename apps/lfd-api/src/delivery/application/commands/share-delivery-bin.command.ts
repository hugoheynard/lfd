import type { ShareDeliveryBinPayload } from "@lfd/contracts";

/** Déclarer l'autre moitié d'un bac partagé (lot 4 bis, v2-4). */
export class ShareDeliveryBinCommand {
  constructor(readonly payload: ShareDeliveryBinPayload) {}
}
