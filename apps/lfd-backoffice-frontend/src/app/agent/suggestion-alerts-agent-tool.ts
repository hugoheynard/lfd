import { declareExperimentalWebMcpTool } from '@angular/core';
import type {
  StaffSuggestionAlertsView,
  StaffSuggestionChoicesView,
  StaffSuggestionRuleView,
} from '@lfd/contracts';

import type { StaffSuggestionsService } from '../suggestions/staff-suggestions.service';
import { ALERT_BADGES, alertLines } from '../suggestions/suggestion-alerts';

import { said } from './agent-tool-text';

/**
 * **`suggestion_alerts`** (RS10) — les règles vivantes dont un article ne se
 * vend plus, comme les badges « Vide » / « Partielle » de l'écran. Même
 * route (`GET admin/suggestions/alerts`, sous `lfc_suggestions:read`), mêmes
 * phrases (`alertLines`).
 */
export function declareSuggestionAlertsTool(
  api: StaffSuggestionsService,
  choices: () => Promise<StaffSuggestionChoicesView | null>,
): void {
  void declareExperimentalWebMcpTool({
    name: 'suggestion_alerts',
    description:
      'Les suggestions décidées À CORRIGER, comme le filtre « À corriger » de l’écran : chaque règle active (non archivée, allumée, en cours ou à venir) dont un article suggéré ne se vend plus — retiré du catalogue, pas vendu à sa clientèle, masqué pour elle, ou commandable aucun jour d’ici la fin de sa période (regardée sur 31 jours au plus) — ou dont le déclencheur n’existe plus au catalogue, ou dont une condition ne peut plus être vraie (point de retrait archivé, aucun jour choisi dans la période restante). « Vide » : plus rien ne s’affiche ; « Partielle » : une partie seulement. Codes de raison entre crochets. Lecture seule.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    execute: () =>
      said('Lecture des alertes des suggestions', async () => {
        const [view, rules, catalogue] = await Promise.all([api.alerts(), api.list(), choices()]);
        return alertsText(view, rules, catalogue);
      }),
  });
}

/** Les alertes en texte : une ligne d'en-tête par règle, puis ses raisons. */
export function alertsText(
  view: StaffSuggestionAlertsView,
  rules: readonly StaffSuggestionRuleView[],
  catalogue: StaffSuggestionChoicesView | null,
): string {
  if (view.rules.length === 0) {
    return `Au ${view.today}, aucune suggestion active n’est à corriger.`;
  }
  const phraseOf = new Map(
    rules.map((rule) => [
      rule.id,
      rule.phrase === null ? '(sans phrase)' : `« ${rule.phrase.fr} »`,
    ]),
  );
  const blocks = view.rules.map((alert) => {
    const codes = [
      ...(alert.triggerWithdrawn ? ['trigger_withdrawn'] : []),
      ...alert.items.map((item) => `${item.sku}:${item.reason}`),
      ...alert.conditions.map((condition) =>
        condition.siteId === null ? condition.reason : `${condition.reason}:${condition.siteId}`,
      ),
    ];
    return [
      `id ${alert.ruleId} — ${phraseOf.get(alert.ruleId) ?? '(règle inconnue)'} · ${ALERT_BADGES[alert.severity].label} [${alert.severity}] [${codes.join(', ')}]`,
      ...alertLines(alert, catalogue).map((line) => `  - ${line}`),
    ].join('\n');
  });
  return [
    `Au ${view.today}, ${String(view.rules.length)} suggestion(s) à corriger :`,
    ...blocks,
  ].join('\n');
}
