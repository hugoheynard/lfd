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
import { StaffSub } from "../../infra/auth/staff.decorator.js";
import { Public } from "../../infra/auth/public.decorator.js";
import { ZodBody } from "../../shared/http/zod-body.pipe.js";
import { CreateCompanyByStaffCommand } from "../application/commands/create-company-by-staff.command.js";
import type { CompanyOpened } from "../application/commands/create-company-by-staff.handler.js";
import { GetCompanyForStaffQuery } from "../application/queries/get-company-for-staff.query.js";
import { GetCustomerSheetQuery } from "../application/queries/get-customer-sheet.query.js";
import { ListAllCompaniesQuery } from "../application/queries/list-all-companies.query.js";
import type { CustomerSheetView } from "@lfd/contracts";
import type {
  AdminCompanyFicheView,
  AdminCompanyView,
} from "../domain/ports/admin-company.reader.js";
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
  getOne(@Param("companyId") companyId: string): Promise<AdminCompanyFicheView> {
    return this.queries.execute<GetCompanyForStaffQuery, AdminCompanyFicheView>(
      new GetCompanyForStaffQuery(companyId),
    );
  }

  /**
   * Ouvre un compte client (Porte B — « le commercial provisionne »).
   *
   * La société naît `pending`, et son **détenteur** — le contact principal, qui
   * est la même personne — est rattaché dans la foulée : identité provisionnée
   * et lien de mot de passe s'il est nouveau, simple rattachement s'il est déjà
   * client. La réponse dit lequel des deux, et si l'e-mail est parti : l'écran
   * ne peut pas le deviner, et le commercial doit pouvoir l'annoncer au client
   * qu'il a encore au téléphone.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @StaffSub() staffSub: string,
    @Body(new ZodBody(adminCreateCompanyPayload)) payload: AdminCreateCompanyPayload,
  ): Promise<CompanyOpened> {
    return await this.commands.execute<CreateCompanyByStaffCommand, CompanyOpened>(
      new CreateCompanyByStaffCommand(
        payload.raisonSociale,
        payload.enseigne,
        payload.formeJuridique,
        payload.siret,
        payload.tvaIntracom,
        payload.primaryContact,
        staffSub,
      ),
    );
  }
}
