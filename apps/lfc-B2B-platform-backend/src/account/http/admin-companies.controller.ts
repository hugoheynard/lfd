import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminAuthGuard } from "../../infra/auth/admin-auth.guard.js";
import { Public } from "../../infra/auth/public.decorator.js";
import { ZodBody } from "../../shared/http/zod-body.pipe.js";
import { CreateCompanyByStaffCommand } from "../application/commands/create-company-by-staff.command.js";
import { ListAllCompaniesQuery } from "../application/queries/list-all-companies.query.js";
import type { AdminCompanyView } from "../domain/ports/admin-company.reader.js";
import { type CreatedCompanyResponse } from "./companies.controller.js";
import { adminCreateCompanyPayload, type AdminCreateCompanyPayload } from "./payloads.js";

/**
 * Surface **admin** (staff) : la **liste** des comptes clients et leur
 * **création** pour l'onglet commercial.
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
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  @Get()
  list(): Promise<readonly AdminCompanyView[]> {
    return this.queries.execute<ListAllCompaniesQuery, readonly AdminCompanyView[]>(
      new ListAllCompaniesQuery(),
    );
  }

  /**
   * Crée un compte client (Porte B — « le commercial provisionne »). La société
   * naît `pending`, **sans propriétaire** : le contact principal est saisi par le
   * staff, et le rattachement d'un client se fera par invitation (à venir).
   * Renvoie l'`id`, de quoi router vers la fiche.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodBody(adminCreateCompanyPayload)) payload: AdminCreateCompanyPayload,
  ): Promise<CreatedCompanyResponse> {
    const id = await this.commands.execute<CreateCompanyByStaffCommand, string>(
      new CreateCompanyByStaffCommand(
        payload.raisonSociale,
        payload.enseigne,
        payload.formeJuridique,
        payload.siret,
        payload.tvaIntracom,
        payload.primaryContact,
      ),
    );
    return { id };
  }
}
