import type { DeclareDeliveryBagsPayload } from "@lfd/contracts";

/** Déclarer `count` sacs de plus pour une commande (lot 4, L4-C16). */
export class DeclareDeliveryBagsCommand {
  constructor(readonly payload: DeclareDeliveryBagsPayload) {}
}
