import type { DeclareDeliveryBinsPayload } from "@lfd/contracts";

/** Déclarer des bacs d'un type pour une commande (lot 4, L4-C16 ; lot 4 bis, tranche B). */
export class DeclareDeliveryBinsCommand {
  constructor(readonly payload: DeclareDeliveryBinsPayload) {}
}
