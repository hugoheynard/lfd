/**
 * Le planificateur de la société de l'espace (le site), à partir d'un jour. `companyId` est la société
 * de l'espace (`@ActingCompany`), `null` en perso — refusé par le mur.
 */
export class GetPlannerQuery {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string | null,
    readonly from: string,
  ) {}
}
