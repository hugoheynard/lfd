import type { OrderCutoffSettingsPatch } from "@lfd/contracts";

/**
 * Activer ou désactiver l'heure limite générale. Acte **staff** :
 * `staffUserId` est figé dans la ligne avec le nom et le rôle.
 */
export class UpdateOrderCutoffSettingsCommand {
  constructor(
    readonly patch: OrderCutoffSettingsPatch,
    readonly staffUserId: string,
  ) {}
}
