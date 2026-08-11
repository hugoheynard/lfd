import type { AccountAlertView } from "@lfd/contracts";
import { Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminAuthGuard } from "../../infra/auth/admin-auth.guard.js";
import { Public } from "../../infra/auth/public.decorator.js";
import { AcknowledgeAlertCommand } from "../application/commands/acknowledge-alert.command.js";
import { ListAccountAlertsQuery } from "../application/queries/list-account-alerts.query.js";

/**
 * Le **journal d'alertes** d'un compte (fiche client, onglet Alertes) et son
 * acquittement.
 *
 * ⚠️ L'acquitteur est pour l'instant une constante : le login staff n'est pas
 * encore branché sur Auth0, donc aucun `sub` réel ne traverse la requête. Écrire
 * un identifiant honnêtement faux vaut mieux que d'en inventer un vrai — il sera
 * remplacé quand la porte staff existera (cf. TODO staff #150).
 */
@Controller("admin")
@Public()
@UseGuards(AdminAuthGuard)
export class AdminAccountAlertsController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  @Get("companies/:companyId/alerts")
  async list(@Param("companyId") companyId: string): Promise<AccountAlertView[]> {
    return this.queries.execute<ListAccountAlertsQuery, AccountAlertView[]>(
      new ListAccountAlertsQuery(companyId),
    );
  }

  @Post("alerts/:alertId/acknowledge")
  @HttpCode(HttpStatus.NO_CONTENT)
  async acknowledge(@Param("alertId") alertId: string): Promise<void> {
    await this.commands.execute<AcknowledgeAlertCommand, void>(
      new AcknowledgeAlertCommand(alertId, UNRESOLVED_STAFF),
    );
  }
}

/** Marqueur explicite tant que l'identité staff n'est pas disponible. */
const UNRESOLVED_STAFF = "staff:unresolved";
