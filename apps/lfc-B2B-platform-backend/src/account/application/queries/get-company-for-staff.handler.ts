import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import {
  AdminCompanyReader,
  type AdminCompanyDetailView,
} from "../../domain/ports/admin-company.reader.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { GetCompanyForStaffQuery } from "./get-company-for-staff.query.js";

/**
 * Sert la fiche d'une société au staff. Pas de mur `company_id` — l'auth staff
 * (`AdminAuthGuard`) garde la surface en amont. `null` (aucune société pour cet
 * id) devient un `CompanyNotFoundError` (404) : le staff voit toutes les
 * sociétés, donc rien à cacher — c'est un simple « n'existe pas ».
 */
@QueryHandler(GetCompanyForStaffQuery)
export class GetCompanyForStaffHandler implements IQueryHandler<
  GetCompanyForStaffQuery,
  AdminCompanyDetailView
> {
  constructor(private readonly companies: AdminCompanyReader) {}

  async execute(query: GetCompanyForStaffQuery): Promise<AdminCompanyDetailView> {
    const company = await this.companies.byId(query.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(query.companyId);
    }
    return company;
  }
}
