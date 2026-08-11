import { type AlertRule, type AlertRuleView, alertRuleSchema } from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Put, UseGuards } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminAuthGuard } from "../../infra/auth/admin-auth.guard.js";
import { Public } from "../../infra/auth/public.decorator.js";
import { StaffSub } from "../../infra/auth/staff.decorator.js";
import { ZodBody } from "../../shared/http/zod-body.pipe.js";
import { SaveAlertRuleCommand } from "../application/commands/save-alert-rule.command.js";
import { ListAlertRulesQuery } from "../application/queries/list-alert-rules.query.js";

/**
 * Les **réglages globaux d'alerte**, côté staff (Réglages → Commercial). Même
 * montage à deux surfaces que les autres contrôleurs admin : `@Public()` désarme
 * le guard client, `AdminAuthGuard` réarme la porte staff.
 *
 * Une seule route d'écriture, **sans le type dans l'URL** : le type est le
 * discriminant des paramètres, donc déjà dans le corps. Le mettre aussi dans le
 * chemin créerait un désaccord possible entre les deux, qu'il faudrait arbitrer.
 */
@Controller("admin/alert-rules")
@Public()
@UseGuards(AdminAuthGuard)
export class AdminAlertRulesController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  @Get()
  async list(): Promise<AlertRuleView[]> {
    return this.queries.execute<ListAlertRulesQuery, AlertRuleView[]>(new ListAlertRulesQuery());
  }

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  async save(
    @Body(new ZodBody(alertRuleSchema)) rule: AlertRule,
    @StaffSub() staffSub: string,
  ): Promise<void> {
    await this.commands.execute<SaveAlertRuleCommand, void>(
      new SaveAlertRuleCommand(rule, staffSub),
    );
  }
}
