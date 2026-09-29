import type { DeliveryRoutingSettingsPayload } from "@lfd/contracts";

/**
 * Poser les réglages du calcul de tournée. Acte **staff** : `staffUserId` est
 * figé dans la ligne avec le nom et le rôle de l'agent.
 */
export class SetRoutingSettingsCommand {
  constructor(
    readonly payload: DeliveryRoutingSettingsPayload,
    readonly staffUserId: string,
  ) {}
}
