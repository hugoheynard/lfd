/** Annule le mode programmé d'un payeur, avant sa prise d'effet (§16.6-2). */
export class CancelPayerBillingModeCommand {
  constructor(
    readonly legalEntityId: string,
    readonly payerCompanyId: string,
    readonly staffId: string,
  ) {}
}
