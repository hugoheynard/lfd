/**
 * Le planificateur est-il ouvert dans l'espace de la requête ? `companyId`
 * est la société de l'espace (`@ActingCompany`), `null` en perso.
 */
export class GetPlannerAccessQuery {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string | null,
  ) {}
}
