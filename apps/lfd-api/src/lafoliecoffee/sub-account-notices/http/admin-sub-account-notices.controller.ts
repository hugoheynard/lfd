import {
  setSubAccountNoticeRulePayloadSchema,
  setSubAccountNoticesEnabledPayloadSchema,
  type SetSubAccountNoticeRulePayload,
  type SetSubAccountNoticesEnabledPayload,
  type SubAccountNoticesView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ResetSubAccountNoticeRulesCommand } from "../application/commands/reset-sub-account-notice-rules.command.js";
import { SetSubAccountNoticesEnabledCommand } from "../application/commands/set-sub-account-notices-enabled.command.js";
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

  /**
   * L'interrupteur, et les 8 × 4 cellules avec ce qui s'applique et si c'est
   * le défaut. Était un tableau nu jusqu'au 2026-10-20 (pré-lancement :
   * contrat cassé dans le même déploiement que l'écran qui le lit).
   */
  @Get()
  async list(@Param("companyId") companyId: string): Promise<SubAccountNoticesView> {
    return this.queries.execute<GetSubAccountNoticeRulesQuery, SubAccountNoticesView>(
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

  /** Active ou coupe TOUS les avis du principal ; rien n'est rattrapé à la réactivation. */
  @Put("enabled")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setEnabled(
    @Param("companyId") companyId: string,
    @Body(new ZodBody(setSubAccountNoticesEnabledPayloadSchema))
    payload: SetSubAccountNoticesEnabledPayload,
    @StaffUserId() staffId: string,
  ): Promise<void> {
    await this.commands.execute<SetSubAccountNoticesEnabledCommand, void>(
      new SetSubAccountNoticesEnabledCommand(companyId, payload.enabled, staffId),
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
