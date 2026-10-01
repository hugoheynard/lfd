import type { UnassignDeliveryDriverPayload } from "@lfd/contracts";

/** Retirer le livreur d'une tournée encore au dépôt (plan « Ma tournée », MT-D2). */
export class UnassignDeliveryDriverCommand {
  constructor(
    readonly roundId: string,
    readonly payload: UnassignDeliveryDriverPayload,
  ) {}
}
