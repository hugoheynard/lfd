/**
 * Programme le mode de facturation d'un PAYEUR (plan
 * `plan-rythme-de-facturation.md`, §16.1 et §16.6-5). Un site qui facture
 * chez un autre est refusé.
 */
export class SetPayerBillingModeCommand {
  constructor(
    readonly legalEntityId: string,
    readonly payerCompanyId: string,
    readonly mode: string,
    readonly staffId: string,
  ) {}
}
