/** Poser les réglages du colisage. Acte **staff** : `staffUserId` est figé dans la ligne. */
export class SetPackingSettingsCommand {
  constructor(
    readonly halfSharing: boolean,
    readonly staffUserId: string,
  ) {}
}
