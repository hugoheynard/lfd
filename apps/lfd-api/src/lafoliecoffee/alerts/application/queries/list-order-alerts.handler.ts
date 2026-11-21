import type { AccountAlertView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { StaffAuthorDirectory } from "../../../../staff/directory/domain/staff-author-directory.js";
import { AlertsOfOrders } from "../../domain/ports/order-alerts.js";
import { ListOrderAlertsQuery } from "./list-order-alerts.query.js";

/**
 * Sert les alertes d'une page de commandes — une lecture des alertes et une
 * de l'annuaire, avec le NOM de qui a acquitté chacune. Lecture pure.
 */
@QueryHandler(ListOrderAlertsQuery)
export class ListOrderAlertsHandler implements IQueryHandler<
  ListOrderAlertsQuery,
  AccountAlertView[]
> {
  constructor(
    private readonly alerts: AlertsOfOrders,
    private readonly staffAuthors: StaffAuthorDirectory,
  ) {}

  async execute(query: ListOrderAlertsQuery): Promise<AccountAlertView[]> {
    const alerts = await this.alerts.of(query.orderIds);
    const authors = await this.staffAuthors.identify(alerts.map((alert) => alert.acknowledgedBy));
    return alerts.map((alert) => ({
      ...alert,
      acknowledgedByName: authors.nameOf(alert.acknowledgedBy),
    }));
  }
}
