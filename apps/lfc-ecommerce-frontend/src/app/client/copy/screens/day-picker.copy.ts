import type { LocaleCode } from '../../client-locale.service';

/**
 * **Ce que dit le panneau du jour** — la première question d'une commande
 * neuve (plan `documentation/commandes/passation/plan-panneau-date.md`).
 */
export interface DayPickerCopy {
  readonly kicker: string;
  readonly title: string;
  readonly lead: string;
  /** Pendant la lecture des jours servis. */
  readonly loading: string;
  /** Le bouton pleine largeur, sans heure limite connue. */
  readonly today: string;
  /** Le même, quand l'heure limite est servie : `{time}`. */
  readonly todayUntil: string;
  /** Le nom du groupe des six jours suivants, lu par le lecteur d'écran. */
  readonly nextGroup: string;
  /** Sous un jour grisé : il n'est pas proposé. */
  readonly closed: string;
  /** Le bouton qui déplie le champ de date. */
  readonly otherDate: string;
  /** Le libellé du champ de date. */
  readonly dateLabel: string;
  /** Le refus d'un jour non servi, sous le champ. */
  readonly notServed: string;
  /** L'action qui prend le jour saisi. */
  readonly confirmDate: string;
  /** Aucun jour servi. */
  readonly none: {
    readonly title: string;
    readonly subtitle: string;
  };
  readonly close: string;
}

export const DAY_PICKER_FR: DayPickerCopy = {
  kicker: 'Étape 1 sur 3',
  title: 'Pour quel jour ?',
  lead: 'Choisissez d’abord le jour : le lieu et l’heure viennent ensuite.',
  loading: 'Nous regardons les jours ouverts…',
  today: 'Aujourd’hui',
  todayUntil: 'Aujourd’hui · commandez avant {time}',
  nextGroup: 'Les jours suivants',
  closed: 'Non proposé',
  otherDate: 'Autre date',
  dateLabel: 'Le jour',
  notServed: 'Ce jour-là n’est pas proposé à la commande.',
  confirmDate: 'Prendre ce jour',
  none: {
    title: 'Aucune journée ouverte',
    subtitle: 'Aucun jour n’est proposé à la commande pour l’instant.',
  },
  close: 'Fermer',
};

export const DAY_PICKER_EN: DayPickerCopy = {
  kicker: 'Step 1 of 3',
  title: 'For which day?',
  lead: 'Pick the day first: the place and the time come next.',
  loading: 'Checking the open days…',
  today: 'Today',
  todayUntil: 'Today · order before {time}',
  nextGroup: 'The following days',
  closed: 'Not offered',
  otherDate: 'Another date',
  dateLabel: 'The day',
  notServed: 'That day is not open for orders.',
  confirmDate: 'Take this day',
  none: {
    title: 'No day open',
    subtitle: 'No day is open for orders right now.',
  },
  close: 'Close',
};

export const DAY_PICKER_IT: DayPickerCopy = {
  kicker: 'Passo 1 di 3',
  title: 'Per quale giorno?',
  lead: 'Scegliete prima il giorno: il luogo e l’ora vengono dopo.',
  loading: 'Controlliamo i giorni aperti…',
  today: 'Oggi',
  todayUntil: 'Oggi · ordinate prima delle {time}',
  nextGroup: 'I giorni successivi',
  closed: 'Non disponibile',
  otherDate: 'Altra data',
  dateLabel: 'Il giorno',
  notServed: 'Quel giorno non è aperto agli ordini.',
  confirmDate: 'Prendo questo giorno',
  none: {
    title: 'Nessuna giornata aperta',
    subtitle: 'Nessun giorno è aperto agli ordini per ora.',
  },
  close: 'Chiudi',
};

const DICTIONARIES: Readonly<Record<LocaleCode, DayPickerCopy>> = {
  fr: DAY_PICKER_FR,
  en: DAY_PICKER_EN,
  it: DAY_PICKER_IT,
};

/** Le dictionnaire de la langue choisie. */
export function dayPickerCopy(locale: LocaleCode): DayPickerCopy {
  return DICTIONARIES[locale];
}
