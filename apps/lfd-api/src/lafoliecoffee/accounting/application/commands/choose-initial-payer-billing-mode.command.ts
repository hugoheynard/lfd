/**
 * Le **premier choix** du mode de facturation d'un payeur, fait par l'équipe
 * sociétés à l'ouverture d'un compte (décidé par Hugo le 2026-11-12). Le
 * changer ensuite reste un geste comptable (`SetPayerBillingModeCommand`).
 */
export class ChooseInitialPayerBillingModeCommand {
  constructor(
    readonly legalEntityId: string,
    readonly payerCompanyId: string,
    readonly mode: string,
    readonly staffId: string,
  ) {}
}
