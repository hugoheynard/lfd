import type { StaffSuggestionCountersView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { InvalidAudiencePeriodError } from "../../domain/errors/recommendation-errors.js";
import { StaffSuggestionCounterReader } from "../../domain/ports/staff-suggestion-counter.reader.js";
import { StaffSuggestionRuleReader } from "../../domain/ports/staff-suggestion-rule.reader.js";
import { tallyStaffCounters } from "../services/staff-counter-totals.js";
import { ListStaffSuggestionCountersQuery } from "./list-staff-suggestion-counters.query.js";

/**
 * **Les chiffres par règle** (RS3) : affichée, cliquée, ajoutée — relus dans
 * les compteurs d'audience anonymes, source `staff`, dont l'emplacement est
 * l'id de la règle en minuscules (§6 du plan).
 *
 * Une règle sans compteur rend des zéros : c'est ce que la boutique a compté,
 * pas une estimation. Les résultats estimés (commandées, chiffre d'affaires)
 * sont à `ListStaffSuggestionResultsQuery` (RS6).
 */
@QueryHandler(ListStaffSuggestionCountersQuery)
export class ListStaffSuggestionCountersHandler implements IQueryHandler<
  ListStaffSuggestionCountersQuery,
  readonly StaffSuggestionCountersView[]
> {
  constructor(
    private readonly counters: StaffSuggestionCounterReader,
    private readonly rules: StaffSuggestionRuleReader,
  ) {}

  async execute(
    query: ListStaffSuggestionCountersQuery,
  ): Promise<readonly StaffSuggestionCountersView[]> {
    // Deux jours `YYYY-MM-DD` se comparent dans l'ordre lexical.
    if (query.from > query.to) {
      throw new InvalidAudiencePeriodError(query.from, query.to);
    }
    const [rows, rules] = await Promise.all([
      this.counters.between(query.from, query.to),
      this.rules.list(),
    ]);
    return tallyStaffCounters(
      rows,
      rules.map((rule) => rule.id),
    ).totals;
  }
}
