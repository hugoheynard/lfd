import {
  setSubAccountNoticeRulePayloadSchema,
  type SetSubAccountNoticeRulePayload,
  type SubAccountNoticeRuleView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ResetSubAccountNoticeRulesCommand } from "../application/commands/reset-sub-account-notice-rules.command.js";
import { SetSubAccountNoticeRuleCommand } from "../application/commands/set-sub-account-notice-rule.command.js";
import { GetSubAccountNoticeRulesQuery } from "../application/queries/get-sub-account-notice-rules.query.js";

/**
 * **Le tableau des avis au principal**, depuis la fiche client du principal
 * (`plan-notifications-sous-comptes.md`, §1, §3). Le droit est celui de la
 * fiche client (`b2b_companies`). `409` sur un sous-compte : les avis se
 * règlent sur son principal.
 */
@Controller("admin/companies/:companyId/sub-account-notices")
@AdminSurface("b2b_companies")
export class AdminSubAccountNoticesController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  /** Les 8 × 4 cellules, chacune avec ce qui s'applique et si c'est le défaut. */
  @Get()
  async list(@Param("companyId") companyId: string): Promise<SubAccountNoticeRuleView[]> {
    return this.queries.execute<GetSubAccountNoticeRulesQuery, SubAccountNoticeRuleView[]>(
      new GetSubAccountNoticeRulesQuery(companyId),
    );
  }

  /** Règle UNE cellule ; la remettre à sa valeur par défaut efface la dérogation. */
  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  async set(
    @Param("companyId") companyId: string,
    @Body(new ZodBody(setSubAccountNoticeRulePayloadSchema))
    payload: SetSubAccountNoticeRulePayload,
    @StaffUserId() staffId: string,
  ): Promise<void> {
    await this.commands.execute<SetSubAccountNoticeRuleCommand, void>(
      new SetSubAccountNoticeRuleCommand(
        companyId,
        payload.kind,
        payload.role,
        payload.enabled,
        staffId,
      ),
    );
  }

  /** « Revenir au défaut » : toutes les dérogations du principal sont effacées. */
  @Post("reset")
  @HttpCode(HttpStatus.NO_CONTENT)
  async reset(@Param("companyId") companyId: string): Promise<void> {
    await this.commands.execute<ResetSubAccountNoticeRulesCommand, void>(
      new ResetSubAccountNoticeRulesCommand(companyId),
    );
  }
}
