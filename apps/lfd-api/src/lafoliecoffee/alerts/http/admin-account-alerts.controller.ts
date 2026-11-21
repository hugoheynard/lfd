import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import {
  type AccountAlertView,
  type OrderAlertsQuery,
  orderAlertsQuerySchema,
  type PendingAlertCounts,
} from "@lfd/contracts";
import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { AcknowledgeAlertCommand } from "../application/commands/acknowledge-alert.command.js";
import { CountPendingAlertsQuery } from "../application/queries/count-pending-alerts.query.js";
import { ListAccountAlertsQuery } from "../application/queries/list-account-alerts.query.js";
import { ListOrderAlertsQuery } from "../application/queries/list-order-alerts.query.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";

/**
 * Le **journal d'alertes** d'un compte (fiche client, onglet Alertes) et son
 * acquittement.
 *
 * L'acquitteur est l'id de fiche posé par `StaffAccessGuard` — un identifiant, pas un
 * nom, pour que « qui a vu cette alerte » reste répondable après un changement
 * de nom ou de rôle.
 */
@Controller("admin")
@AdminSurface("b2b_alerts")
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

  /**
   * Les alertes d'une page de commandes, en une lecture —
   * `?orderIds=a,b,c` (au plus 200). L'onglet « À vérifier » les déplie sous
   * chaque ligne (plan du visa des commandes, V4).
   */
  @Get("alerts")
  async ofOrders(
    @Query(new ZodQuery(orderAlertsQuerySchema)) query: OrderAlertsQuery,
  ): Promise<AccountAlertView[]> {
    return this.queries.execute<ListOrderAlertsQuery, AccountAlertView[]>(
      new ListOrderAlertsQuery(query.orderIds),
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
  @Idempotent(
    "acquitte l'alerte sous la condition `acknowledgedAt: null` : rejouée, la ligne déjà acquittée n'est pas touchée et garde son premier auteur",
  )
  async acknowledge(
    @Param("alertId") alertId: string,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<AcknowledgeAlertCommand, void>(
      new AcknowledgeAlertCommand(alertId, staffUserId),
    );
  }
}
