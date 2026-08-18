/**
 * Query **admin** : la **fiche** d'une société par son id, pour le commercial.
 *
 * Un seul paramètre, `companyId` : l'autorisation est portée par le guard staff
 * (`AdminAuthGuard`), pas par la query — comme {@link ListAllCompaniesQuery}, la
 * lecture est **cross-tenant** assumée.
 */
export class GetCompanyForStaffQuery {
  constructor(readonly companyId: string) {}
}
