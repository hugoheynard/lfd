import { Controller, Get, UseGuards } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminAuthGuard } from "../../infra/auth/admin-auth.guard.js";
import { Public } from "../../infra/auth/public.decorator.js";
import type { AdminCompanyView } from "../domain/ports/admin-company.reader.js";
import { ListAllCompaniesQuery } from "../application/queries/list-all-companies.query.js";

/**
 * Surface **admin** (staff) : liste des comptes clients pour l'onglet commercial.
 *
 * `@Public()` **désarme** le guard client global (le staff n'a pas de token
 * client) ; `@UseGuards(AdminAuthGuard)` **réarme** avec la porte staff (audience
 * dédiée, ou bypass de dev). C'est le montage à deux surfaces de l'Invariant C :
 * un seul backend B2B, deux publics, la confiance vient du JWT.
 */
@Controller("admin/companies")
@Public()
@UseGuards(AdminAuthGuard)
export class AdminCompaniesController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  list(): Promise<readonly AdminCompanyView[]> {
    return this.queries.execute<ListAllCompaniesQuery, readonly AdminCompanyView[]>(
      new ListAllCompaniesQuery(),
    );
  }
}
