import type { LegalEntityView } from '@lfd/contracts';

import { day, instant } from './invoice-dossier-format';

/**
 * Les mots de la carte « Prélèvement automatique », écrits pour un gérant qui
 * n'a ni le plan ni le vocabulaire bancaire sous les yeux.
 *
 * ## Ce qui n'est PAS recalculé ici
 *
 * Le report au jour ouvré bancaire et la date limite de dépôt dépendent du
 * calendrier des banques (week-ends, fériés, Pâques) : seul le serveur le
 * connaît, et c'est la même fonction qui date le fichier du lot. Les exemples
 * calculés à partir d'une saisie restent donc GÉNÉRIQUES (« clôture le 1er +
 * N jours ») et le disent ; les dates exactes du mois en cours sont celles
 * que le serveur rend dans `nextCollection`.
 */

/** Une étape de la frise du mois — forme compatible avec un nœud `fold-timeline`. */
export interface CollectionStep {
  readonly key: string;
  readonly id: null;
  readonly label: string;
  readonly displayDate: string;
}

/** Ce que la frise affiche quand la banque n'a pas encore donné sa limite. */
export const DEPOSIT_UNKNOWN = 'à renseigner';

/** Le calendrier de ce mois, dans l'ordre où les choses arrivent. */
export function collectionSteps(next: LegalEntityView['nextCollection']): CollectionStep[] {
  const deposit = next.depositDeadline;
  return [
    { key: 'closes', id: null, label: 'Le mois se clôt', displayDate: instant(next.closesAt) },
    {
      key: 'prepared',
      id: null,
      label: 'Le lot de prélèvement est préparé',
      displayDate: instant(next.plannedConstitutionAt),
    },
    {
      key: 'deposit',
      id: null,
      label: 'Dernier moment pour déposer le fichier à la banque',
      displayDate:
        deposit === null ? DEPOSIT_UNKNOWN : `avant le ${day(deposit.day)} à ${deposit.time}`,
    },
    {
      key: 'collected',
      id: null,
      label: 'Vos clients sont prélevés',
      displayDate: day(next.collectionDay),
    },
  ];
}

const twoDigits = (value: number): string => String(value).padStart(2, '0');

/** « Le mois se clôt à minuit ; le lot est préparé à 01h00. » */
export function delayExample(hours: number | null): string {
  if (hours === null) {
    return 'Indiquez un nombre d’heures.';
  }
  return `Exemple : le mois se clôt le 1er à minuit, le lot est préparé le 1er à ${twoDigits(hours)}h00.`;
}

/** Au-delà, « le 1er + N » sortirait du mois : on parle en jours plutôt qu'en date. */
const LAST_SAFE_DAY_OF_MONTH = 28;

function collectionDayAfter(days: number): string {
  const date = 1 + days;
  return date <= LAST_SAFE_DAY_OF_MONTH ? `le ${date}` : `${days} jours après le 1er`;
}

/** L'exemple du délai entre la clôture et le prélèvement, vide compris. */
export function daysExample(days: number | null, noticeDays: number): string {
  const effective = days ?? noticeDays;
  const prefix =
    days === null
      ? `Laissé vide : ${noticeDays} jours, le délai d’avis à vos clients. `
      : 'Exemple : ';
  return (
    `${prefix}clôture le 1er + ${effective} jours → prélèvement ${collectionDayAfter(effective)}` +
    ' (ou le jour ouvré bancaire suivant si la banque est fermée).'
  );
}

/** Vrai quand la saisie précède la fin du délai d'avis — le serveur la refusera. */
export function daysTooShort(days: number | null, noticeDays: number): boolean {
  return days !== null && days < noticeDays;
}

/** L'exemple de la limite de dépôt, ou ce qu'il manque pour le donner. */
export function depositExample(businessDays: number | null, time: string): string {
  const trimmed = time.trim();
  if (businessDays === null && trimmed === '') {
    return 'Pas encore renseignée : la frise affiche « à renseigner ».';
  }
  if (businessDays === null || trimmed === '') {
    return 'Renseignez le nombre de jours ET l’heure, ou laissez les deux vides.';
  }
  const plural = businessDays > 1 ? 's' : '';
  return (
    `Exemple : ${businessDays} jour${plural} ouvré${plural} avant, ${trimmed} → déposer le fichier ` +
    `${businessDays} jour${plural} ouvré${plural} bancaire${plural} avant le prélèvement, avant ${trimmed}. ` +
    'Rien n’est bloqué : c’est un rappel.'
  );
}
