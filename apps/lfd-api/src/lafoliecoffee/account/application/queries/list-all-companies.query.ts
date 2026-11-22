import type { CompanyListScope } from "../../domain/ports/admin-company.reader.js";

/**
 * Query **admin** : lister les sociétés (cross-tenant), pour l'onglet
 * « Comptes clients » du staff commercial. `listed` écarte les comptes
 * supprimés, `archived` ne rend qu'eux ; l'autorisation est portée par le
 * guard staff, pas par la query.
 */
export class ListAllCompaniesQuery {
  constructor(readonly scope: CompanyListScope) {}
}
