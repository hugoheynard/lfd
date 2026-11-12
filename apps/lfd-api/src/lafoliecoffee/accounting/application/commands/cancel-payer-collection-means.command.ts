/** Annule le moyen d'encaissement programmé d'un payeur, avant sa prise d'effet. */
export class CancelPayerCollectionMeansCommand {
  constructor(
    readonly legalEntityId: string,
    readonly payerCompanyId: string,
    readonly staffId: string,
  ) {}
}
