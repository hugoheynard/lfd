import type { OrderCutoffSettingsPatch } from "@lfd/contracts";

/**
 * Autoriser ou non les commandes pour le jour même. Acte **staff** :
 * `staffUserId` est figé dans la ligne avec le nom et le rôle.
 */
export class UpdateOrderCutoffSettingsCommand {
  constructor(
    readonly patch: OrderCutoffSettingsPatch,
    readonly staffUserId: string,
  ) {}
}
