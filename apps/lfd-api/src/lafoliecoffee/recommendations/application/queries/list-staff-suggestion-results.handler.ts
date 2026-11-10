import { addDays, instantToLocal, type StaffSuggestionResultsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { ComputedSuggestionCounterReader } from "../../domain/ports/computed-suggestion-counter.reader.js";
import { StaffSuggestionCounterReader } from "../../domain/ports/staff-suggestion-counter.reader.js";
import { StaffSuggestionRuleReader } from "../../domain/ports/staff-suggestion-rule.reader.js";
import { SuggestedSkuSalesReader } from "../../domain/ports/suggested-sku-sales.reader.js";
import {
  addRateBasisPoints,
  attributeOrders,
  type SkuDaySales,
  type SuggestionAttribution,
  type SuggestionDayAdds,
} from "../../domain/services/suggestion-attribution.js";
import { computedClaimant, tallyComputedCounters } from "../services/computed-counter-totals.js";
import { tallyStaffCounters } from "../services/staff-counter-totals.js";
import { ListStaffSuggestionResultsQuery } from "./list-staff-suggestion-results.query.js";

/**
 * **Les résultats par règle** (RS6) : affichée, cliquée, ajoutée — comptées —,
 * puis commandées et chiffre d'affaires HT — ESTIMÉS par `attributeOrders`,
 * faute de pouvoir relier une commande à un clic anonyme.
 *
 * Le calculé (« souvent pris avec », « vos habituels ») a ses lignes, et ses
 * ajouts entrent dans le MÊME partage que ceux des règles (Hugo, 2026-10-18) :
 * une pièce n'est jamais attribuée deux fois, et une règle du staff qui
 * partage un article avec le calculé voit sa part baisser.
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
    private readonly computedCounters: ComputedSuggestionCounterReader,
    private readonly rules: StaffSuggestionRuleReader,
    private readonly sales: SuggestedSkuSalesReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: ListStaffSuggestionResultsQuery): Promise<StaffSuggestionResultsView> {
    const to = instantToLocal(this.clock.now()).day;
    const from = addDays(to, 1 - query.days);
    const [staffRows, dataRows, rules] = await Promise.all([
      this.counters.between(from, to),
      this.computedCounters.between(from, to),
      this.rules.list(),
    ]);
    const staff = tallyStaffCounters(
      staffRows,
      rules.map((rule) => rule.id),
    );
    const computed = tallyComputedCounters(dataRows);
    const adds = [...staff.adds, ...computed.adds];
    const attributed = attributeOrders(adds, await this.salesOf(from, to, adds));
    return {
      days: query.days,
      from,
      to,
      rules: staff.totals.map((total) => ({
        ...total,
        ...resultOf(total, attributed.get(total.ruleId)),
      })),
      computed: computed.totals.map((total) => ({
        ...total,
        ...resultOf(total, attributed.get(computedClaimant(total.kind))),
      })),
    };
  }

  private salesOf(
    from: string,
    to: string,
    adds: readonly SuggestionDayAdds[],
  ): Promise<readonly SkuDaySales[]> {
    const skus = [...new Set(adds.map((row) => row.sku))];
    return skus.length === 0 ? Promise.resolve([]) : this.sales.dailySales(from, to, skus);
  }
}

/** Les trois chiffres dérivés d'une ligne : taux, commandées et CA estimés. */
function resultOf(
  counted: { readonly shown: number; readonly added: number },
  attribution: SuggestionAttribution | undefined,
): { orderedEstimate: number; addRateBasisPoints: number | null; revenueEstimateCents: number } {
  return {
    orderedEstimate: attribution?.orderedEstimate ?? 0,
    addRateBasisPoints: addRateBasisPoints(counted.added, counted.shown),
    revenueEstimateCents: attribution?.revenueEstimateCents ?? 0,
  };
}
