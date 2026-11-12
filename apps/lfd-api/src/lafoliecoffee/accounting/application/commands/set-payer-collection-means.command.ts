/**
 * Change le moyen d'encaissement d'un PAYEUR (plan
 * `plan-paiement-au-compte-par-virement.md`, V1, V2, V10), avec son motif.
 */
export class SetPayerCollectionMeansCommand {
  constructor(
    readonly legalEntityId: string,
    readonly payerCompanyId: string,
    readonly means: string,
    readonly reason: string,
    readonly staffId: string,
  ) {}
}
