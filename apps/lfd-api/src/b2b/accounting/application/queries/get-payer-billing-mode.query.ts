/** Le mode de facturation d'un payeur sous une entité (plan `plan-rythme-de-facturation.md`, §16.4). */
export class GetPayerBillingModeQuery {
  constructor(
    readonly legalEntityId: string,
    readonly payerCompanyId: string,
  ) {}
}
