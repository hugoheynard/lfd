/**
 * Le **mandat à signer** du client, en PDF nominatif — le brouillon seulement.
 *
 * Plan `documentation/comptabilite/plan-mandat-client.md` §6 #3 et #4 : la RUM ne
 * s'imprime que sur un brouillon, et l'IBAN entier y figure (assumé par Hugo le
 * 2026-09-14 : un mandat EPC porte l'IBAN du débiteur).
 */
export class GetMyCompanyMandateDocumentQuery {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
  ) {}
}
