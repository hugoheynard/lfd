import { addDays, instantToLocal, type StaffSuggestionResultsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { StaffSuggestionCounterReader } from "../../domain/ports/staff-suggestion-counter.reader.js";
import { StaffSuggestionRuleReader } from "../../domain/ports/staff-suggestion-rule.reader.js";
import { SuggestedSkuSalesReader } from "../../domain/ports/suggested-sku-sales.reader.js";
import {
  addRateBasisPoints,
  attributeOrders,
  type RuleDayAdds,
  type SkuDaySales,
} from "../../domain/services/suggestion-attribution.js";
import { tallyStaffCounters } from "../services/staff-counter-totals.js";
import { ListStaffSuggestionResultsQuery } from "./list-staff-suggestion-results.query.js";

/**
 * **Les résultats par règle** (RS6) : affichée, cliquée, ajoutée — comptées —,
 * puis commandées et chiffre d'affaires HT — ESTIMÉS par `attributeOrders`,
 * faute de pouvoir relier une commande à un clic anonyme.
 *
 * La période finit aujourd'hui (jour métier du `Clock`) et compte `days`
 * jours. Les ventes ne se lisent que pour les articles qu'une suggestion a
 * fait ajouter : un article jamais ajouté n'a rien à attribuer.
 */
@QueryHandler(ListStaffSuggestionResultsQuery)
export class ListStaffSuggestionResultsHandler implements IQueryHandler<
  ListStaffSuggestionResultsQuery,
  StaffSuggestionResultsView
> {
  constructor(
    private readonly counters: StaffSuggestionCounterReader,
    private readonly rules: StaffSuggestionRuleReader,
    private readonly sales: SuggestedSkuSalesReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: ListStaffSuggestionResultsQuery): Promise<StaffSuggestionResultsView> {
    const to = instantToLocal(this.clock.now()).day;
    const from = addDays(to, 1 - query.days);
    const [rows, rules] = await Promise.all([this.counters.between(from, to), this.rules.list()]);
    const { totals, adds } = tallyStaffCounters(
      rows,
      rules.map((rule) => rule.id),
    );
    const attributed = attributeOrders(adds, await this.salesOf(from, to, adds));
    return {
      days: query.days,
      from,
      to,
      rules: totals.map((total) => ({
        ...total,
        orderedEstimate: attributed.get(total.ruleId)?.orderedEstimate ?? 0,
        addRateBasisPoints: addRateBasisPoints(total.added, total.shown),
        revenueEstimateCents: attributed.get(total.ruleId)?.revenueEstimateCents ?? 0,
      })),
    };
  }

  private salesOf(
    from: string,
    to: string,
    adds: readonly RuleDayAdds[],
  ): Promise<readonly SkuDaySales[]> {
    const skus = [...new Set(adds.map((row) => row.sku))];
    return skus.length === 0 ? Promise.resolve([]) : this.sales.dailySales(from, to, skus);
  }
}
