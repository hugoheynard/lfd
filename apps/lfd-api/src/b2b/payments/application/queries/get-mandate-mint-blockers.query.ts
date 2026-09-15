/**
 * Ce qui empêche aujourd'hui le **staff** de frapper un mandat pour cette
 * société — lu avec la section paiement de la fiche.
 */
export class GetMandateMintBlockersQuery {
  constructor(readonly companyId: string) {}
}
