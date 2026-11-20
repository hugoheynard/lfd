import {
  type SiteMenuStatePayload,
  siteMenuStatePayloadSchema,
  type SubAccountMenuPayload,
  subAccountMenuPayloadSchema,
  type SubAccountMenuView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { IntentKey } from "../../../platform/shared/http/intent-key.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { SetSubAccountMenuStateByStaffCommand } from "../application/commands/set-sub-account-menu-state-by-staff.command.js";
import { SetSubAccountMenuByStaffCommand } from "../application/commands/set-sub-account-menu-by-staff.command.js";
import { GetSubAccountMenuForStaffQuery } from "../application/queries/get-sub-account-menu-for-staff.query.js";

/**
 * **La carte d'un sous-compte**, sur sa fiche client (`carte-des-sites.md`,
 * § 3.2) : sous `b2b_companies`, comme la fiche elle-même — lecture pour la
 * lire, écriture pour la poser.
 */
@Controller("admin/companies")
@AdminSurface("b2b_companies")
export class AdminCompanySubAccountMenuController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get(":companyId/menu")
  async read(@Param("companyId") companyId: string): Promise<SubAccountMenuView> {
    return this.queries.execute<GetSubAccountMenuForStaffQuery, SubAccountMenuView>(
      new GetSubAccountMenuForStaffQuery(companyId),
    );
  }

  /**
   * Pose la carte entière ; `204`. `409` si la société n'a pas de principal.
   * Le geste prévient le principal par e-mail (Q3) : une fois par intention
   * de l'écran (en-tête `Idempotency-Key`, obligatoire).
   */
  @Put(":companyId/menu")
  @HttpCode(HttpStatus.NO_CONTENT)
  async set(
    @Param("companyId") companyId: string,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
    @Body(new ZodBody(subAccountMenuPayloadSchema)) payload: SubAccountMenuPayload,
  ): Promise<void> {
    await this.commands.execute<SetSubAccountMenuByStaffCommand, void>(
      new SetSubAccountMenuByStaffCommand(companyId, staffUserId, payload, intentKey),
    );
  }

  /**
   * Le site suit la carte commune, ou reprend sa carte propre ; `204`. `409`
   * pour reprendre une carte propre qui n'existe pas. Le principal en est
   * prévenu (Q3) : une fois par intention (`Idempotency-Key`, obligatoire).
   */
  @Put(":companyId/menu/state")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setState(
    @Param("companyId") companyId: string,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
    @Body(new ZodBody(siteMenuStatePayloadSchema)) payload: SiteMenuStatePayload,
  ): Promise<void> {
    await this.commands.execute<SetSubAccountMenuStateByStaffCommand, void>(
      new SetSubAccountMenuStateByStaffCommand(companyId, staffUserId, payload.state, intentKey),
    );
  }
}
