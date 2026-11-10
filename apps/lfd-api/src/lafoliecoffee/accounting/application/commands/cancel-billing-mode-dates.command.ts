/** Annule le changement de dates programmé d'un mode, avant sa prise d'effet (§16.6-2). */
export class CancelBillingModeDatesCommand {
  constructor(
    readonly legalEntityId: string,
    readonly mode: string,
    readonly staffId: string,
  ) {}
}
