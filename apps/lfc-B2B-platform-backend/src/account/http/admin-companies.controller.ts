import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminAuthGuard } from "../../infra/auth/admin-auth.guard.js";
import { Public } from "../../infra/auth/public.decorator.js";
import { ZodBody } from "../../shared/http/zod-body.pipe.js";
import { CreateCompanyByStaffCommand } from "../application/commands/create-company-by-staff.command.js";
import { GetCompanyForStaffQuery } from "../application/queries/get-company-for-staff.query.js";
import { GetCustomerSheetQuery } from "../application/queries/get-customer-sheet.query.js";
import { ListAllCompaniesQuery } from "../application/queries/list-all-companies.query.js";
import type { CustomerSheetView } from "@lfd/contracts";
import type {
  AdminCompanyDetailView,
  AdminCompanyView,
} from "../domain/ports/admin-company.reader.js";
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
   * La **fiche** d'une société : tout ce que porte la liste, plus l'obligation de
   * TVA et les adresses complètes — de quoi refléter l'état d'activation et le
   * compléter (Porte B). `404` si l'id n'existe pas (le handler lève).
   */
  /**
   * La **fiche commerciale** d'un compte : qui il est, ce qu'il pèse, ce qu'il a
   * commandé. Route distincte de la fiche staff (`GET :companyId`) : celle-ci
   * agrège des chiffres et se lit pendant un appel, celle-là décrit un dossier.
   */
  @Get(":companyId/customer-sheet")
  customerSheet(@Param("companyId") companyId: string): Promise<CustomerSheetView> {
    return this.queries.execute<GetCustomerSheetQuery, CustomerSheetView>(
      new GetCustomerSheetQuery(companyId),
    );
  }

  @Get(":companyId")
  getOne(@Param("companyId") companyId: string): Promise<AdminCompanyDetailView> {
    return this.queries.execute<GetCompanyForStaffQuery, AdminCompanyDetailView>(
      new GetCompanyForStaffQuery(companyId),
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
