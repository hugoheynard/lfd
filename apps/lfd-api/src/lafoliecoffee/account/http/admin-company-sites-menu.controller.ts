import {
  type PrincipalSitesMenuView,
  type SubAccountMenuPayload,
  subAccountMenuPayloadSchema,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { IntentKey } from "../../../platform/shared/http/intent-key.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { SetPrincipalSitesMenuByStaffCommand } from "../application/commands/set-principal-sites-menu-by-staff.command.js";
import { GetPrincipalSitesMenuForStaffQuery } from "../application/queries/get-principal-sites-menu-for-staff.query.js";

/**
 * **La carte commune des sites**, sur la fiche client du principal
 * (`carte-des-sites.md`, § 6) : sous `b2b_companies`, comme la carte d'un site.
 */
@Controller("admin/companies")
@AdminSurface("b2b_companies")
export class AdminCompanySitesMenuController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get(":companyId/sites-menu")
  async read(@Param("companyId") companyId: string): Promise<PrincipalSitesMenuView> {
    return this.queries.execute<GetPrincipalSitesMenuForStaffQuery, PrincipalSitesMenuView>(
      new GetPrincipalSitesMenuForStaffQuery(companyId),
    );
  }

  /**
   * Pose la carte commune entière ; `204`. `409` si la société est elle-même
   * un site. Le principal en est prévenu par e-mail : une fois par intention
   * de l'écran (en-tête `Idempotency-Key`, obligatoire).
   */
  @Put(":companyId/sites-menu")
  @HttpCode(HttpStatus.NO_CONTENT)
  async set(
    @Param("companyId") companyId: string,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
    @Body(new ZodBody(subAccountMenuPayloadSchema)) payload: SubAccountMenuPayload,
  ): Promise<void> {
    await this.commands.execute<SetPrincipalSitesMenuByStaffCommand, void>(
      new SetPrincipalSitesMenuByStaffCommand(companyId, staffUserId, payload, intentKey),
    );
  }
}
