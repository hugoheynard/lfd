import type { StaffSuggestionResultPeriod } from "@lfd/contracts";

/** Les résultats de chaque règle sur les `days` derniers jours métier, aujourd'hui compris (RS6). */
export class ListStaffSuggestionResultsQuery {
  constructor(readonly days: StaffSuggestionResultPeriod) {}
}
