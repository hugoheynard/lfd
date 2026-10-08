import type { DeliveryVatMode } from "@lfd/contracts";

/** Pose ou remplace le mode de TVA de la livraison. */
export class SaveOrderDeliveryVatCommand {
  constructor(
    readonly mode: DeliveryVatMode,
    readonly updatedBy: string,
  ) {}
}
