import type { DeliveryPricingPatch } from "@lfd/contracts";

/**
 * Régler le frais de base ou le franco d'une audience, pour toutes les zones
 * qui ne le remplacent pas. Acte **staff** : `staffUserId` est figé dans la
 * ligne avec le nom et le rôle.
 */
export class UpdateDeliveryPricingCommand {
  constructor(
    readonly patch: DeliveryPricingPatch,
    readonly staffUserId: string,
  ) {}
}
