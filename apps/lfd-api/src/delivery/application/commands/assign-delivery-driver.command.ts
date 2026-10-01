import type { AssignDeliveryDriverPayload } from "@lfd/contracts";

/** Affecter un livreur à une tournée encore au dépôt (plan « Ma tournée », MT-D2). */
export class AssignDeliveryDriverCommand {
  constructor(
    readonly roundId: string,
    readonly payload: AssignDeliveryDriverPayload,
  ) {}
}
