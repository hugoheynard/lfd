import { instantToLocal, type StaffSuggestionRuleView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { StaffSuggestionRuleReader } from "../../domain/ports/staff-suggestion-rule.reader.js";
import { SuggestionOrderReader } from "../../domain/ports/suggestion-order.reader.js";
import { applicableSuggestions } from "../../domain/services/applicable-suggestions.js";
import { ListApplicableStaffSuggestionsQuery } from "./list-applicable-staff-suggestions.query.js";
import { staffSuggestionView } from "./staff-suggestion-view.js";

/**
 * Applique la période (jour métier de Paris, lu au `Clock`), l'audience,
 * l'interrupteur et l'ordre réglé. **Sans** le déclencheur ni le filtre de ce
 * qui se commande (R0) : tous deux s'appliquent à l'affichage (RS2).
 */
@QueryHandler(ListApplicableStaffSuggestionsQuery)
export class ListApplicableStaffSuggestionsHandler implements IQueryHandler<
  ListApplicableStaffSuggestionsQuery,
  readonly StaffSuggestionRuleView[]
> {
  constructor(
    private readonly rules: StaffSuggestionRuleReader,
    private readonly order: SuggestionOrderReader,
    private readonly clock: Clock,
  ) {}

  async execute(
    query: ListApplicableStaffSuggestionsQuery,
  ): Promise<readonly StaffSuggestionRuleView[]> {
    const [live, order] = await Promise.all([this.rules.listLive(), this.order.current()]);
    return applicableSuggestions(live, {
      placement: query.placement,
      today: instantToLocal(this.clock.now()).day,
      reader: query.reader,
      order: order.order,
    }).map(staffSuggestionView);
  }
}
