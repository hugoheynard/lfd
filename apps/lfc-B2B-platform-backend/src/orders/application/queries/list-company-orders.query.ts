/**
 * Liste les commandes d'une entreprise. `actorUserId` accompagne `companyId` : la
 * lecture est **murée** au niveau membre (voir les commandes de son entreprise ne
 * requiert pas d'en être le gestionnaire).
 */
export class ListCompanyOrdersQuery {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
  ) {}
}
