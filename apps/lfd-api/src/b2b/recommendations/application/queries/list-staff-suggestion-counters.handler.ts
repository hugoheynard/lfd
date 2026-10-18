import type {
  ProductAudienceEvent,
  ProductAudienceSource,
  StaffSuggestionCountersView,
} from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { InvalidAudiencePeriodError } from "../../domain/errors/recommendation-errors.js";
import { AudienceCounterReader } from "../../domain/ports/audience-counter.reader.js";
import { StaffSuggestionRuleReader } from "../../domain/ports/staff-suggestion-rule.reader.js";
import { ListStaffSuggestionCountersQuery } from "./list-staff-suggestion-counters.query.js";

/** La source d'un compteur de suggestion décidée (§6 du plan). */
const STAFF_SOURCE: ProductAudienceSource = "staff";

/** Le geste compté → la colonne de l'écran. Les vues et ajouts directs n'en sont pas. */
const COLUMN_OF: Partial<
  Record<ProductAudienceEvent, keyof Omit<StaffSuggestionCountersView, "ruleId">>
> = {
  suggestion_shown: "shown",
  suggestion_clicked: "clicked",
  suggestion_added: "added",
};

/**
 * **Les chiffres par règle** (RS3) : affichée, cliquée, ajoutée — relus dans
 * les compteurs d'audience anonymes, source `staff`, dont l'emplacement est
 * l'id de la règle en minuscules (§6 du plan).
 *
 * Une règle sans compteur rend des zéros : c'est ce que la boutique a compté,
 * pas une estimation. Un compteur `staff` dont l'emplacement ne nomme aucune
 * règle connue est ignoré : il ne se rattache à rien.
 */
@QueryHandler(ListStaffSuggestionCountersQuery)
export class ListStaffSuggestionCountersHandler implements IQueryHandler<
  ListStaffSuggestionCountersQuery,
  readonly StaffSuggestionCountersView[]
> {
  constructor(
    private readonly counters: AudienceCounterReader,
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
    const totals = new Map(
      rules.map((rule) => [
        rule.id.toLowerCase(),
        { ruleId: rule.id, shown: 0, clicked: 0, added: 0 },
      ]),
    );
    for (const row of rows) {
      const column = COLUMN_OF[row.event];
      const total = totals.get(row.placement);
      if (row.source !== STAFF_SOURCE || column === undefined || total === undefined) {
        continue;
      }
      total[column] += row.count;
    }
    return [...totals.values()];
  }
}
