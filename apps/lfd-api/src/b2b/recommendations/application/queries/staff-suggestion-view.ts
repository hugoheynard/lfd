import type { StaffSuggestionRuleView } from "@lfd/contracts";

import type { StaffSuggestionRuleSnapshot } from "../../domain/entities/staff-suggestion-rule.js";

/** Une règle telle que l'écran la lit : jours en `AAAA-MM-JJ`, instants en ISO. */
export function staffSuggestionView(rule: StaffSuggestionRuleSnapshot): StaffSuggestionRuleView {
  return {
    id: rule.id,
    audienceKey: rule.id.toLowerCase(),
    trigger: { kind: rule.trigger.kind, ref: rule.trigger.ref },
    suggestedSkus: [...rule.suggestedSkus],
    placement: rule.placement,
    audience: rule.audience,
    startsOn: rule.period.startsOn,
    endsOn: rule.period.endsOn,
    phrase: rule.phrase === null ? null : { ...rule.phrase },
    priority: rule.priority,
    active: rule.active,
    archivedAt: rule.archivedAt === null ? null : rule.archivedAt.toISOString(),
    createdAt: rule.created.at.toISOString(),
    updatedAt: rule.lastWrite.at.toISOString(),
  };
}
