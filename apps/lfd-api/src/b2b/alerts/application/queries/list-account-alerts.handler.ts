import type { AccountAlertView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { StaffAuthorDirectory } from "../../../../staff/directory/domain/staff-author-directory.js";
import { AccountAlertRepository } from "../../domain/ports/account-alert.repository.js";
import { ListAccountAlertsQuery } from "./list-account-alerts.query.js";

/**
 * Sert le journal d'un compte, du plus récent au plus ancien — avec le NOM de
 * qui a acquitté chaque alerte (`architecture-journalisation.md` §12, D3).
 * Lecture pure.
 */
@QueryHandler(ListAccountAlertsQuery)
export class ListAccountAlertsHandler implements IQueryHandler<
  ListAccountAlertsQuery,
  AccountAlertView[]
> {
  constructor(
    private readonly journal: AccountAlertRepository,
    private readonly staffAuthors: StaffAuthorDirectory,
  ) {}

  async execute(query: ListAccountAlertsQuery): Promise<AccountAlertView[]> {
    const alerts = await this.journal.listForCompany(query.companyId);
    const authors = await this.staffAuthors.identify(alerts.map((alert) => alert.acknowledgedBy));
    return alerts.map((alert) => ({
      ...alert,
      acknowledgedByName: authors.nameOf(alert.acknowledgedBy),
    }));
  }
}
