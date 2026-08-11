import type { AccountAlertView, PendingAlertCounts } from "@lfd/contracts";
import { Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminAuthGuard } from "../../infra/auth/admin-auth.guard.js";
import { Public } from "../../infra/auth/public.decorator.js";
import { StaffSub } from "../../infra/auth/staff.decorator.js";
import { AcknowledgeAlertCommand } from "../application/commands/acknowledge-alert.command.js";
import { CountPendingAlertsQuery } from "../application/queries/count-pending-alerts.query.js";
import { ListAccountAlertsQuery } from "../application/queries/list-account-alerts.query.js";

/**
 * Le **journal d'alertes** d'un compte (fiche client, onglet Alertes) et son
 * acquittement.
 *
 * L'acquitteur est le `sub` posé par l'`AdminAuthGuard` — un identifiant, pas un
 * nom, pour que « qui a vu cette alerte » reste répondable après un changement
 * de nom ou de rôle.
 */
@Controller("admin")
@Public()
@UseGuards(AdminAuthGuard)
export class AdminAccountAlertsController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  /**
   * La pastille de la **liste** des comptes, en une lecture.
   *
   * Déclarée avant la route par société : Nest apparie dans l'ordre, et un
   * segment fixe placé après un paramètre finit par être avalé par lui.
   */
  @Get("alerts/pending")
  async pending(): Promise<PendingAlertCounts> {
    return this.queries.execute<CountPendingAlertsQuery, PendingAlertCounts>(
      new CountPendingAlertsQuery(),
    );
  }

  @Get("companies/:companyId/alerts")
  async list(@Param("companyId") companyId: string): Promise<AccountAlertView[]> {
    return this.queries.execute<ListAccountAlertsQuery, AccountAlertView[]>(
      new ListAccountAlertsQuery(companyId),
    );
  }

  @Post("alerts/:alertId/acknowledge")
  @HttpCode(HttpStatus.NO_CONTENT)
  async acknowledge(
    @Param("alertId") alertId: string,
    @StaffSub() staffSub: string,
  ): Promise<void> {
    await this.commands.execute<AcknowledgeAlertCommand, void>(
      new AcknowledgeAlertCommand(alertId, staffSub),
    );
  }
}
