/** Poser les réglages du contrôle qualité. Acte **staff** : `staffUserId` est figé dans la ligne. */
export class SetQualityControlSettingsCommand {
  constructor(
    readonly lineChecks: boolean,
    readonly orderChecks: boolean,
    readonly staffUserId: string,
  ) {}
}
