import type { LocaleCode } from '../../client-locale.service';

/**
 * **Ce que dit le panneau du jour** — la première question d'une commande
 * neuve (plan `documentation/commandes/passation/parcours-de-service.md`).
 */
export interface DayPickerCopy {
  /**
   * Le surtitre dit ce qui est DÉJÀ acquis, pas un numéro d'étape (Hugo,
   * 2026-10-27 : les chemins sont trop nombreux pour qu'un « 1 sur 3 » reste
   * vrai) — la barre du pied montre la progression. Sans mode connu.
   */
  readonly kicker: string;
  /** Le mode est connu : retrait, `{place}` quand la maison l'est aussi. */
  readonly kickerPickup: string;
  readonly kickerPickupAt: string;
  readonly kickerDelivery: string;
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
  /** Le bouton qui déplie le calendrier. */
  readonly otherDate: string;
  /** Les noms des flèches du calendrier (lus, pas vus). */
  readonly previousMonth: string;
  readonly nextMonth: string;
  /** Aucun jour servi. */
  readonly none: {
    readonly title: string;
    readonly subtitle: string;
  };
  readonly close: string;
}

export const DAY_PICKER_FR: DayPickerCopy = {
  kicker: 'Ma commande',
  kickerPickup: 'Retrait',
  kickerPickupAt: 'Retrait · {place}',
  kickerDelivery: 'Livraison',
  title: 'Pour quel jour ?',
  lead: 'Choisissez d’abord la date à laquelle vous souhaitez recevoir votre commande.',
  loading: 'Nous regardons les jours ouverts…',
  today: 'Aujourd’hui',
  todayUntil: 'Aujourd’hui · commandez avant {time}',
  nextGroup: 'Les jours suivants',
  closed: 'Non proposé',
  otherDate: 'Autre date',
  previousMonth: 'Mois précédent',
  nextMonth: 'Mois suivant',
  none: {
    title: 'Aucune journée ouverte',
    subtitle: 'Aucun jour n’est proposé à la commande pour l’instant.',
  },
  close: 'Fermer',
};

export const DAY_PICKER_EN: DayPickerCopy = {
  kicker: 'My order',
  kickerPickup: 'Pickup',
  kickerPickupAt: 'Pickup · {place}',
  kickerDelivery: 'Delivery',
  title: 'For which day?',
  lead: 'First choose the date on which you would like to receive your order.',
  loading: 'Checking the open days…',
  today: 'Today',
  todayUntil: 'Today · order before {time}',
  nextGroup: 'The following days',
  closed: 'Not offered',
  otherDate: 'Another date',
  previousMonth: 'Previous month',
  nextMonth: 'Next month',
  none: {
    title: 'No day open',
    subtitle: 'No day is open for orders right now.',
  },
  close: 'Close',
};

export const DAY_PICKER_IT: DayPickerCopy = {
  kicker: 'Il mio ordine',
  kickerPickup: 'Ritiro',
  kickerPickupAt: 'Ritiro · {place}',
  kickerDelivery: 'Consegna',
  title: 'Per quale giorno?',
  lead: 'Scegliete prima la data in cui desiderate ricevere il vostro ordine.',
  loading: 'Controlliamo i giorni aperti…',
  today: 'Oggi',
  todayUntil: 'Oggi · ordinate prima delle {time}',
  nextGroup: 'I giorni successivi',
  closed: 'Non disponibile',
  otherDate: 'Altra data',
  previousMonth: 'Mese precedente',
  nextMonth: 'Mese successivo',
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
