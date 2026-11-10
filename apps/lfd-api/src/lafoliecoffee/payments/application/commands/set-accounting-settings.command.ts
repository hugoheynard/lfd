/** Poser le plafond des liens libres. `null` = aucun plafond. */
export class SetAccountingSettingsCommand {
  constructor(
    readonly paymentLinkMaxCents: number | null,
    readonly staffUserId: string,
  ) {}
}
