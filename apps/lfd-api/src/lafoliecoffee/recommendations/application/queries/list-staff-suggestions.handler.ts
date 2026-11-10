import type { StaffSuggestionRuleView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { StaffSuggestionRuleReader } from "../../domain/ports/staff-suggestion-rule.reader.js";
import { ListStaffSuggestionsQuery } from "./list-staff-suggestions.query.js";
import { staffSuggestionView } from "./staff-suggestion-view.js";

/** Relit les règles, la plus récemment créée d'abord. */
@QueryHandler(ListStaffSuggestionsQuery)
export class ListStaffSuggestionsHandler implements IQueryHandler<
  ListStaffSuggestionsQuery,
  readonly StaffSuggestionRuleView[]
> {
  constructor(private readonly rules: StaffSuggestionRuleReader) {}

  async execute(): Promise<readonly StaffSuggestionRuleView[]> {
    return (await this.rules.list()).map(staffSuggestionView);
  }
}
