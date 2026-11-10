import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import {
  AdminCompanyReader,
  type AdminCompanyView,
} from "../../domain/ports/admin-company.reader.js";
import { ListAllCompaniesQuery } from "./list-all-companies.query.js";

/**
 * Lecture admin cross-tenant : délègue au `AdminCompanyReader`. Pas de mur
 * `company_id` ici — c'est **volontaire** et gardé en amont par l'auth staff
 * (`AdminAuthGuard`). Une lecture ne mute rien : aucune règle à rejouer.
 */
@QueryHandler(ListAllCompaniesQuery)
export class ListAllCompaniesHandler implements IQueryHandler<
  ListAllCompaniesQuery,
  readonly AdminCompanyView[]
> {
  constructor(private readonly companies: AdminCompanyReader) {}

  execute(): Promise<readonly AdminCompanyView[]> {
    return this.companies.listAll();
  }
}
