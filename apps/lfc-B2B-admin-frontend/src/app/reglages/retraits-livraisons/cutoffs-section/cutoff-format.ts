import type { OrderCutoffView, Weekday } from '@lfd/contracts';

/** Les jours, dans l'ordre où on les propose (lundi d'abord, usage FR). */
export const WEEKDAY_CHOICES: readonly { readonly value: Weekday; readonly label: string }[] = [
  { value: 'mon', label: 'Lundi' },
  { value: 'tue', label: 'Mardi' },
  { value: 'wed', label: 'Mercredi' },
  { value: 'thu', label: 'Jeudi' },
  { value: 'fri', label: 'Vendredi' },
  { value: 'sat', label: 'Samedi' },
  { value: 'sun', label: 'Dimanche' },
];

const LABELS = new Map(WEEKDAY_CHOICES.map((choice) => [choice.value, choice.label]));

/** « Mercredi », ou « Tous les jours » quand la règle ne vise aucun jour. */
export function weekdayLabel(weekday: Weekday | null): string {
  return weekday === null ? 'Tous les jours' : (LABELS.get(weekday) ?? weekday);
}

/** À qui s'applique la règle : un point nommé, ou le défaut de la plateforme. */
export function scopeLabel(rule: OrderCutoffView): string {
  return rule.pickupLabel ?? 'Tous les points (défaut)';
}

/**
 * La règle en une phrase : « La veille à 18:00 », « L'avant-veille à 18:00 »,
 * « Le jour même à 06:30 ».
 *
 * Une phrase plutôt que « J−1 · 18:00 » parce que c'est ce qu'on dira au
 * téléphone, et parce qu'un `daysBefore` nu se lit à l'envers une fois sur deux.
 */
export function cutoffSentence(rule: OrderCutoffView): string {
  return `${dayPhrase(rule.daysBefore)} à ${rule.time}`;
}

function dayPhrase(daysBefore: number): string {
  switch (daysBefore) {
    case 0:
      return 'Le jour même';
    case 1:
      return 'La veille';
    case 2:
      return "L'avant-veille";
    default:
      return `${daysBefore} jours avant`;
  }
}
