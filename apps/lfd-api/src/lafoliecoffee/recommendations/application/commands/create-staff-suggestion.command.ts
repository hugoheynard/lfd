import type { StaffSuggestionRuleInput } from "../../domain/entities/staff-suggestion-rule.js";

/** **Créer une suggestion décidée** : la règle entière. Elle naît allumée. */
export class CreateStaffSuggestionCommand {
  constructor(
    readonly rule: StaffSuggestionRuleInput,
    /** Qui la crée — un `StaffUser.id`, ou `null` hors requête. */
    readonly writtenBy: string | null,
    /** La fiche du staff qui agit : l'acteur de l'intention. */
    readonly staffUserId: string,
    /** La clé d'intention de l'écran (`Idempotency-Key`) : un rejeu ne refait pas le geste. */
    readonly intentKey: string,
  ) {}
}
