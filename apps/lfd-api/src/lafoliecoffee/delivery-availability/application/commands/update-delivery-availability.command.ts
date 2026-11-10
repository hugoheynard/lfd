import type { DeliveryAvailabilityPatch } from "@lfd/contracts";

/**
 * Ouvrir ou fermer la livraison à une clientèle. Acte **staff** : `staffUserId` est
 * figé dans la ligne avec le nom et le rôle de l'agent.
 */
export class UpdateDeliveryAvailabilityCommand {
  constructor(
    readonly patch: DeliveryAvailabilityPatch,
    readonly staffUserId: string,
  ) {}
}
