import {
  type AlertRuleView,
  type SaveAlertRulePayload,
  saveAlertRulePayloadSchema,
} from "@lfd/contracts";
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
 *
 * La charge porte la **version lue** (`expectedUpdatedAt`) : deux commerciaux sur
 * cet écran ne doivent pas s'écraser en silence. Un 409 dit lequel a perdu.
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
    @Body(new ZodBody(saveAlertRulePayloadSchema)) payload: SaveAlertRulePayload,
    @StaffSub() staffSub: string,
  ): Promise<void> {
    await this.commands.execute<SaveAlertRuleCommand, void>(
      new SaveAlertRuleCommand(
        payload.rule,
        staffSub,
        payload.expectedUpdatedAt === null ? null : new Date(payload.expectedUpdatedAt),
      ),
    );
  }
}
