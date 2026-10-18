import type {
  StaffSuggestionChoicesView,
  StaffSuggestionOrderView,
  StaffSuggestionRuleView,
} from '@lfd/contracts';

import {
  audienceLabel,
  periodLabel,
  placementLabel,
  suggestedLabel,
  triggerLabel,
} from '../suggestions/suggestion-format';

/**
 * **Les suggestions décidées en texte**, pour un agent — ce que l'écran
 * Gestion Boutique › Suggestions montre, avec les ids et les SKU qu'un outil
 * d'écriture demande.
 */

function stateOf(rule: StaffSuggestionRuleView): string {
  if (rule.archivedAt !== null) {
    return 'ARCHIVÉE';
  }
  return rule.active ? 'active' : 'COUPÉE';
}

/** Une règle en une ligne : l'id, l'état, et tout ce qu'elle dit. */
export function suggestionText(
  rule: StaffSuggestionRuleView,
  choices: StaffSuggestionChoicesView | null,
): string {
  const phrase = rule.phrase === null ? '« Notre conseil » (sans phrase)' : `« ${rule.phrase.fr} »`;
  return [
    `id ${rule.id} — ${stateOf(rule)} — ${phrase}`,
    `déclencheur : ${triggerLabel(rule, choices)} [${rule.trigger.kind}${rule.trigger.ref === null ? '' : ` ${rule.trigger.ref}`}]`,
    `montre : ${suggestedLabel(rule, choices)} [${rule.suggestedSkus.join(', ')}]`,
    `emplacement : ${placementLabel(rule.placement)} [${rule.placement}]`,
    `audience : ${audienceLabel(rule.audience)} [${rule.audience}]`,
    `période : ${periodLabel(rule)} [${rule.startsOn} → ${rule.endsOn}]`,
    `priorité : ${rule.priority}`,
  ].join(' · ');
}

/** L'ordre réglé, dit en clair. */
export function orderText(view: StaffSuggestionOrderView): string {
  const said =
    view.order === 'priority'
      ? 'par priorité (la plus haute d’abord, puis la plus récente)'
      : 'la plus récente d’abord';
  return `Ordre entre suggestions concurrentes : ${said} [${view.order}]${view.updatedAt === null ? ' — jamais réglé, c’est le défaut' : ''}.`;
}
