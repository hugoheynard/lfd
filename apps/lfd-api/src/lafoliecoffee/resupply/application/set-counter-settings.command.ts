/** Pose les réglages du comptoir d'un point. Acte staff. */
export class SetCounterSettingsCommand {
  constructor(
    readonly siteId: string,
    readonly stockTracking: boolean,
    readonly immediateWithoutStock: boolean,
    readonly staffUserId: string,
  ) {}
}
