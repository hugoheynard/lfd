import type { DeliveryAvailabilityPatch } from "@lfd/contracts";

/**
 * Ouvrir ou fermer la livraison à une clientèle. Acte **staff** : `staffSub` est
 * figé dans la ligne avec le nom et le rôle de l'agent.
 */
export class UpdateDeliveryAvailabilityCommand {
  constructor(
    readonly patch: DeliveryAvailabilityPatch,
    readonly staffSub: string,
  ) {}
}
