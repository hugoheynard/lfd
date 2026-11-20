import {
  type SubAccountMenuPayload,
  subAccountMenuPayloadSchema,
  type SubAccountMenuView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { SetSubAccountMenuByStaffCommand } from "../application/commands/set-sub-account-menu-by-staff.command.js";
import { GetSubAccountMenuForStaffQuery } from "../application/queries/get-sub-account-menu-for-staff.query.js";

/**
 * **La carte d'un sous-compte**, sur sa fiche client (`plan-carte-des-sites.md`,
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

  /** Pose la carte entière ; `204`. `409` si la société n'a pas de principal. */
  @Put(":companyId/menu")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "pose la carte entière : rejouée, la carte est déjà dans cet état et rien n'est écrit, journalisé ni purgé",
  )
  async set(
    @Param("companyId") companyId: string,
    @StaffUserId() staffUserId: string,
    @Body(new ZodBody(subAccountMenuPayloadSchema)) payload: SubAccountMenuPayload,
  ): Promise<void> {
    await this.commands.execute<SetSubAccountMenuByStaffCommand, void>(
      new SetSubAccountMenuByStaffCommand(companyId, staffUserId, payload),
    );
  }
}
