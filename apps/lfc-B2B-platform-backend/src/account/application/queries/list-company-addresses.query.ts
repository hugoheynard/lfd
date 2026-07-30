/**
 * Liste les adresses d'une entreprise (facturation + livraisons).
 *
 * `actorUserId` accompagne `companyId` : la lecture est **murée** comme les
 * écritures, mais au niveau « membre » — voir les adresses de son entreprise ne
 * requiert pas d'en être le gestionnaire.
 */
export class ListCompanyAddressesQuery {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
  ) {}
}
