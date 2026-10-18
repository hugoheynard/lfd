import { declareExperimentalWebMcpTool } from '@angular/core';
import {
  DEFAULT_STAFF_SUGGESTION_RESULT_PERIOD,
  STAFF_SUGGESTION_RESULT_PERIODS,
  type StaffSuggestionResultPeriod,
  type StaffSuggestionResultsView,
  type StaffSuggestionRuleView,
} from '@lfd/contracts';

import type { StaffSuggestionsService } from '../suggestions/staff-suggestions.service';
import { addRateLabel, ESTIMATE_HELP, revenueLabel } from '../suggestions/suggestion-results';

import { said } from './agent-tool-text';

/**
 * **`suggestion_results`** (RS6) — les chiffres de l'écran Suggestions, par
 * règle : affichée, cliquée, ajoutée, taux d'ajout, puis commandées et
 * chiffre d'affaires HT ESTIMÉS. Même route que l'écran
 * (`GET admin/suggestions/results`, sous `lfc_suggestions:read`).
 */
export function declareSuggestionResultsTool(api: StaffSuggestionsService): void {
  void declareExperimentalWebMcpTool({
    name: 'suggestion_results',
    description:
      'Les résultats des suggestions décidées, comme le bloc « Chiffres » de l’écran : sur `days` jours (7, 30 ou 90 ; 30 par défaut, aujourd’hui compris), pour CHAQUE règle (archivées comprises) : affichée, cliquée, ajoutée (comptées par la boutique), taux d’ajout (ajoutées ÷ affichées), commandées et chiffre d’affaires HT apporté — ces deux-là ESTIMÉS, faute de pouvoir relier une commande à un clic anonyme (l’estimation est expliquée en tête de réponse). Lecture seule.',
    inputSchema: {
      type: 'object',
      properties: { days: { type: 'integer', enum: STAFF_SUGGESTION_RESULT_PERIODS } },
      additionalProperties: false,
    },
    execute: (args: { readonly days?: StaffSuggestionResultPeriod | undefined }) =>
      said('Lecture des résultats des suggestions', async () => {
        const [view, rules] = await Promise.all([
          api.results(args.days ?? DEFAULT_STAFF_SUGGESTION_RESULT_PERIOD),
          api.list(),
        ]);
        return resultsText(view, rules);
      }),
  });
}

/** Les résultats en texte : la période et l'aide, puis une ligne par règle. */
export function resultsText(
  view: StaffSuggestionResultsView,
  rules: readonly StaffSuggestionRuleView[],
): string {
  const phraseOf = new Map(
    rules.map((rule) => [
      rule.id,
      rule.phrase === null ? '« Notre conseil »' : `« ${rule.phrase.fr} »`,
    ]),
  );
  const lines = view.rules.map(
    (row) =>
      `id ${row.ruleId} — ${phraseOf.get(row.ruleId) ?? '(règle inconnue)'} · affichée ${String(row.shown)} · cliquée ${String(row.clicked)} · ajoutée ${String(row.added)} · taux d’ajout ${addRateLabel(row)} · commandées (estimé) ${String(row.orderedEstimate)} · CA HT apporté (estimé) ${revenueLabel(row)}`,
  );
  return [
    `Du ${view.from} au ${view.to} (${String(view.days)} jours). ${ESTIMATE_HELP}`,
    lines.length === 0 ? 'Aucune suggestion décidée.' : lines.join('\n'),
  ].join('\n');
}
