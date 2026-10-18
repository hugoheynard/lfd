import type {
  StaffSuggestionAlertReason,
  StaffSuggestionAlertSeverity,
  StaffSuggestionChoicesView,
  StaffSuggestionReader,
  StaffSuggestionRuleAlert,
} from '@lfd/contracts';

import { frenchPeriod } from './suggestion-summary';

/**
 * **Les alertes d'une règle, dites en français** (RS10,
 * `documentation/recommandation-produit/suggestions-du-staff.md` §13) : une
 * règle vivante dont un article ne se vend plus. Le serveur juge ; l'écran ne
 * fait que dire.
 */

export const ALERT_BADGES: Readonly<
  Record<
    StaffSuggestionAlertSeverity,
    { readonly label: string; readonly variant: 'alert' | 'warning' }
  >
> = {
  empty: { label: 'Vide', variant: 'alert' },
  partial: { label: 'Partielle', variant: 'warning' },
};

const TO_WHOM: Readonly<Record<StaffSuggestionReader, string>> = {
  pro: 'aux professionnels',
  public: 'aux particuliers',
};

const FOR_WHOM: Readonly<Record<StaffSuggestionReader, string>> = {
  pro: 'pour les professionnels',
  public: 'pour les particuliers',
};

/** Une raison pour un article, et les clientèles qu'elle touche. */
interface Grouped {
  readonly sku: string;
  readonly reason: StaffSuggestionAlertReason;
  readonly audiences: StaffSuggestionReader[];
}

function nameOf(choices: StaffSuggestionChoicesView | null, sku: string): string {
  return choices?.articles.find((article) => article.sku === sku)?.name ?? sku;
}

function joined(audiences: readonly StaffSuggestionReader[], words: typeof TO_WHOM): string {
  return audiences.map((audience) => words[audience]).join(' et ');
}

function group(alert: StaffSuggestionRuleAlert): readonly Grouped[] {
  const groups: Grouped[] = [];
  for (const item of alert.items) {
    const found = groups.find((one) => one.sku === item.sku && one.reason === item.reason);
    const target = found ?? { sku: item.sku, reason: item.reason, audiences: [] };
    if (found === undefined) {
      groups.push(target);
    }
    if (item.audience !== null) {
      target.audiences.push(item.audience);
    }
  }
  return groups;
}

function line(
  grouped: Grouped,
  alert: StaffSuggestionRuleAlert,
  choices: StaffSuggestionChoicesView | null,
): string {
  const name = `« ${nameOf(choices, grouped.sku)} »`;
  switch (grouped.reason) {
    case 'withdrawn':
      return `${name} est retiré du catalogue.`;
    case 'not_for_audience':
      return `${name} n’est plus vendu ${joined(grouped.audiences, TO_WHOM)}.`;
    case 'hidden_for_audience':
      return `${name} est masqué ${joined(grouped.audiences, FOR_WHOM)}.`;
    case 'never_orderable':
      return `${name} n’est commandable aucun jour ${untilOf(alert)} (${joined(grouped.audiences, TO_WHOM)}).`;
  }
}

/** « d'ici le 25 octobre », et l'aveu quand la période dépasse l'horizon regardé. */
function untilOf(alert: StaffSuggestionRuleAlert): string {
  if (alert.window === null) {
    return 'de la période';
  }
  const until = `d’ici ${frenchPeriod(alert.window.to, alert.window.to)}`;
  return alert.window.capped ? `${until} (la suite de la période n’est pas regardée)` : until;
}

/** Les phrases d'une alerte, le déclencheur d'abord. */
export function alertLines(
  alert: StaffSuggestionRuleAlert,
  choices: StaffSuggestionChoicesView | null,
): readonly string[] {
  const trigger = alert.triggerWithdrawn
    ? [
        'Le déclencheur nomme un article ou une famille qui n’est plus au catalogue : la suggestion ne peut plus se déclencher.',
      ]
    : [];
  return [...trigger, ...group(alert).map((grouped) => line(grouped, alert, choices))];
}

/** Le filtre de la liste : toutes, ou seulement celles à corriger. */
export type AlertFilter = 'all' | 'to_fix';

export const ALERT_FILTER_ALL: AlertFilter = 'all';
export const ALERT_FILTER_TO_FIX: AlertFilter = 'to_fix';

export function alertFilterOf(value: string): AlertFilter | null {
  return value === ALERT_FILTER_ALL || value === ALERT_FILTER_TO_FIX ? value : null;
}
