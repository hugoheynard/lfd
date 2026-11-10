import type { CustomerCancellationSettingsPatch } from "@lfd/contracts";

/**
 * Ouvrir, fermer ou régler l'annulation par les particuliers. Acte **staff** :
 * `staffUserId` est figé dans la ligne avec le nom et le rôle.
 */
export class UpdateCustomerCancellationSettingsCommand {
  constructor(
    readonly patch: CustomerCancellationSettingsPatch,
    readonly staffUserId: string,
  ) {}
}
