import { NO_STAFF_SUGGESTION_CONDITIONS, type StaffSuggestionRulePayload } from "@lfd/contracts";

import type { StaffSuggestionRuleInput } from "../domain/entities/staff-suggestion-rule.js";

/**
 * Le corps reçu vers la règle à juger. Un client d'avant RS8 n'envoie pas de
 * conditions : sa règle n'en a aucune — et une réécriture sans elles les
 * retire, puisqu'un `PUT` remplace tout.
 */
export function ruleInputOf(body: StaffSuggestionRulePayload): StaffSuggestionRuleInput {
  const { conditions, ...rule } = body;
  return { ...rule, conditions: conditions ?? NO_STAFF_SUGGESTION_CONDITIONS };
}
