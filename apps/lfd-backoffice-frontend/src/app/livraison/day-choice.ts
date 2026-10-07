import type { FoldViewToggleOption } from 'fold-ng';

import { shiftDay } from './run-sheet';

/**
 * Le sélecteur de jour de l'organisateur : « Aujourd'hui », « Demain », ou
 * une date. Sorti de `RoundsPage` : ce qui ne dépend que du jour et de
 * l'horloge se lit sans la page.
 */

export const TODAY = '0';
export const TOMORROW = '1';
export const OTHER = 'other';

export const DAY_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: TODAY, label: 'Aujourd’hui' },
  { value: TOMORROW, label: 'Demain' },
  { value: OTHER, label: 'Autre jour' },
];

/** Le segment allumé ; « Autre jour » choisi ouvre la date, même sur aujourd'hui ou demain. */
export function dayChoiceOf(day: string, today: string, otherPicked: boolean): string {
  if (otherPicked) {
    return OTHER;
  }
  if (day === today) {
    return TODAY;
  }
  return day === shiftDay(today, 1) ? TOMORROW : OTHER;
}
