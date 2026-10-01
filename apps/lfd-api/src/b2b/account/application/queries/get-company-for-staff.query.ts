/**
 * Query **admin** : la **fiche** d'une société par son id, pour le commercial.
 *
 * Aucun mur dans la query : l'autorisation est portée par le guard staff
 * (`AdminAuthGuard`), pas par la query — comme {@link ListAllCompaniesQuery}, la
 * lecture est **cross-tenant** assumée.
 *
 * `withProcedureCounts` dit si le lecteur a `delivery_procedures:read`
 * (`plan-droits-par-geste.md`, DG-D8) : la fiche s'ouvre sous
 * `b2b_companies`, le nombre d'étapes de procédure relève d'un autre droit.
 */
export class GetCompanyForStaffQuery {
  constructor(
    readonly companyId: string,
    readonly withProcedureCounts: boolean,
  ) {}
}
