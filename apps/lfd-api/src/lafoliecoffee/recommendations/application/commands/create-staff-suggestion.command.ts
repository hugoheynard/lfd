import type { StaffSuggestionRuleInput } from "../../domain/entities/staff-suggestion-rule.js";

/** **Créer une suggestion décidée** : la règle entière. Elle naît allumée. */
export class CreateStaffSuggestionCommand {
  constructor(
    readonly rule: StaffSuggestionRuleInput,
    /** Qui la crée — un `StaffUser.id`, ou `null` hors requête. */
    readonly writtenBy: string | null,
  ) {}
}
