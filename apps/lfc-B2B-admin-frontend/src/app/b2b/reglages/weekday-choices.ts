import type { Weekday } from '@lfd/contracts';

/**
 * **Les jours de la semaine, en français**, partagés par les réglages de
 * l'e-commerce.
 *
 * Ils vivaient dans `cutoffs-section/cutoff-format.ts` et n'y servaient qu'aux
 * heures limites. Les **créneaux publics** en ont exactement le même besoin
 * (plan `documentation/b2b/plan-creneaux-de-retrait.md`, D2) : une règle vise un
 * jour, ou tous. Les importer d'une section sœur aurait couplé deux écrans qui
 * n'ont rien à se dire ; les recopier aurait fait **deux vérités sur les jours
 * de la semaine**, dont l'une finirait par dériver. Ils montent donc d'un cran,
 * comme `pickup-opening.model.ts` et `pickup-discount-audience.ts` avant eux.
 *
 * ⚠️ L'ordre commence **lundi**, et c'est un choix d'usage français — le
 * contrat, lui, n'ordonne rien (`weekdaySchema` est un ensemble), et
 * `weekdayOf` du paquet de temps compte à partir de dimanche. Ne pas confondre
 * les deux : celui-ci sert à PROPOSER, l'autre à CALCULER.
 */
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
