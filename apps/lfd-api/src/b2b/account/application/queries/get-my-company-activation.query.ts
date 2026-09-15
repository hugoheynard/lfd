/**
 * Le verdict d'activation d'une entreprise, demandé par l'un de ses membres.
 *
 * `actorUserId` accompagne `companyId` : la lecture est murée au niveau
 * « membre », comme les adresses — savoir ce qui manque à son entreprise ne
 * requiert pas d'en être le gestionnaire.
 */
export class GetMyCompanyActivationQuery {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
  ) {}
}
