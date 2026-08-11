import type { AccountAlertView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { AccountAlertRepository } from "../../domain/ports/account-alert.repository.js";
import { ListAccountAlertsQuery } from "./list-account-alerts.query.js";

/** Sert le journal d'un compte, du plus récent au plus ancien. Lecture pure. */
@QueryHandler(ListAccountAlertsQuery)
export class ListAccountAlertsHandler implements IQueryHandler<
  ListAccountAlertsQuery,
  AccountAlertView[]
> {
  constructor(private readonly journal: AccountAlertRepository) {}

  execute(query: ListAccountAlertsQuery): Promise<AccountAlertView[]> {
    return this.journal.listForCompany(query.companyId);
  }
}
