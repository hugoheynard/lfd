import type { StaffSuggestionRuleInput } from "../../domain/entities/staff-suggestion-rule.js";

/** **Réécrire une suggestion** : la règle entière remplace l'ancienne. */
export class ReviseStaffSuggestionCommand {
  constructor(
    readonly id: string,
    readonly rule: StaffSuggestionRuleInput,
    readonly writtenBy: string | null,
  ) {}
}
