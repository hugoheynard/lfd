import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import {
  accountAlertOverrideSchema,
  alertKindSchema,
  type AccountAlertOverride,
  type AccountAlertRuleView,
  type AlertKind,
} from "@lfd/contracts";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { StaffSub } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ClearAccountAlertOverrideCommand } from "../application/commands/clear-account-alert-override.command.js";
import { SaveAccountAlertOverrideCommand } from "../application/commands/save-account-alert-override.command.js";
import { GetAccountAlertRulesQuery } from "../application/queries/get-account-alert-rules.query.js";

/**
 * Les alertes **vues depuis un compte** (fiche client, onglet Alertes) : la règle
 * globale rappelée, la dérogation éventuelle, et ce qui s'applique.
 *
 * Écrire une dérogation, c'est `PUT` ; revenir au réglage global, c'est
 * `DELETE` — et pas un `PUT` d'un mode « hérité ». L'absence de ligne **est**
 * l'héritage : lui donner une représentation écrite créerait deux façons de dire
 * la même chose, dont une seule serait vraie.
 */
@Controller("admin/companies/:companyId/alert-rules")
@AdminSurface("companies")
export class AdminAccountAlertRulesController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  @Get()
  async list(@Param("companyId") companyId: string): Promise<AccountAlertRuleView[]> {
    return this.queries.execute<GetAccountAlertRulesQuery, AccountAlertRuleView[]>(
      new GetAccountAlertRulesQuery(companyId),
    );
  }

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  async save(
    @Param("companyId") companyId: string,
    @Body(new ZodBody(accountAlertOverrideSchema)) override: AccountAlertOverride,
    @StaffSub() staffSub: string,
  ): Promise<void> {
    await this.commands.execute<SaveAccountAlertOverrideCommand, void>(
      new SaveAccountAlertOverrideCommand(companyId, override, staffSub),
    );
  }

  @Delete(":kind")
  @HttpCode(HttpStatus.NO_CONTENT)
  async clear(@Param("companyId") companyId: string, @Param("kind") kind: string): Promise<void> {
    await this.commands.execute<ClearAccountAlertOverrideCommand, void>(
      new ClearAccountAlertOverrideCommand(companyId, parseKind(kind)),
    );
  }
}

/** Le type vient de l'URL ici : il se valide à la frontière, comme un corps. */
function parseKind(raw: string): AlertKind {
  const parsed = alertKindSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestException(`Type d'alerte inconnu : ${raw}`);
  }
  return parsed.data;
}
