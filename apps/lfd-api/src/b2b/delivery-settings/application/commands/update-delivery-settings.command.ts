import type { DeliverySettingsPatch } from "@lfd/contracts";

/**
 * Ouvrir ou fermer la livraison à une clientèle. Acte **staff** : `staffSub` est
 * figé dans la ligne avec le nom et le rôle de l'agent.
 */
export class UpdateDeliverySettingsCommand {
  constructor(
    readonly patch: DeliverySettingsPatch,
    readonly staffSub: string,
  ) {}
}
