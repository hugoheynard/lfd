import type { AlertRuleView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { resolveGlobalRules } from "../../domain/alert-rules.js";
import { AlertRulesStore } from "../../domain/ports/alert-rules.store.js";
import { ListAlertRulesQuery } from "./list-alert-rules.query.js";

/**
 * Sert les réglages globaux. Le port ne rend que ce qui est **stocké** ; c'est
 * `resolveGlobalRules` (pur) qui complète avec les défauts de chaque type — un
 * type jamais réglé sort quand même, actif et daté `null`.
 */
@QueryHandler(ListAlertRulesQuery)
export class ListAlertRulesHandler implements IQueryHandler<ListAlertRulesQuery, AlertRuleView[]> {
  constructor(private readonly store: AlertRulesStore) {}

  async execute(): Promise<AlertRuleView[]> {
    return resolveGlobalRules(await this.store.readAll());
  }
}
