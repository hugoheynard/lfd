import type { AccountAlertRuleView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { resolveAccountRules } from "../../domain/account-alert-rules.js";
import { resolveGlobalRules } from "../../domain/alert-rules.js";
import { AccountAlertOverridesStore } from "../../domain/ports/account-alert-overrides.store.js";
import { AlertRulesStore } from "../../domain/ports/alert-rules.store.js";
import { GetAccountAlertRulesQuery } from "./get-account-alert-rules.query.js";

/**
 * Sert les trois choses **ensemble** — ce que dit le global, ce que le compte en
 * fait, ce qui s'applique. L'écran de la fiche a besoin des trois : il rappelle
 * la règle de la plateforme *et* dit en clair quand le compte y déroge, sans quoi
 * une dérogation resterait invisible au prochain commercial.
 */
@QueryHandler(GetAccountAlertRulesQuery)
export class GetAccountAlertRulesHandler implements IQueryHandler<
  GetAccountAlertRulesQuery,
  AccountAlertRuleView[]
> {
  constructor(
    private readonly rules: AlertRulesStore,
    private readonly overrides: AccountAlertOverridesStore,
  ) {}

  async execute(query: GetAccountAlertRulesQuery): Promise<AccountAlertRuleView[]> {
    const [stored, overrides] = await Promise.all([
      this.rules.readAll(),
      this.overrides.readForCompany(query.companyId),
    ]);
    return resolveAccountRules(resolveGlobalRules(stored), overrides);
  }
}
