import type { LocaleCode } from '../../client-locale.service';

/**
 * **Ce que dit le récapitulatif de commande** — la maison et l'heure retenues,
 * rappelées au-dessus du rayon.
 *
 * 🔴 Les deux gestes sont SÉPARÉS — « changer de maison » et « changer l'heure »
 * — et ce n'est pas une commodité. Un seul bouton « Modifier » renverrait à
 * l'écran du mode de service, qui repose les deux questions : changer d'heure
 * obligerait à re-choisir la maison. Deux verbes, deux retours.
 */
export interface CommandTermsCopy {
  /** Le sur-titre de la carte : ce dont elle parle. */
  readonly title: string;

  /** Les deux journées qui se disent d'un mot. Cf. `serviceDayLabel`. */
  readonly today: string;
  readonly tomorrow: string;

  readonly changeHouse: string;
  readonly changeTime: string;

  /** Ce qui suit « Ma commande · » — le MODE retenu. */
  readonly pickup: string;
  readonly delivery: string;

  /** Le compte du panier : `{n}` pièce(s). */
  readonly pieceOne: string;
  readonly pieceMany: string;

  /** La remise obtenue, relue du devis — `{amount}` déjà formaté. Tue à zéro. */
  readonly discount: string;

  /** Le geste de la barre ; le total se lit à sa droite. */
  readonly pay: string;

  /** Panier vide : aucun bouton, une phrase qui dit où agir. */
  readonly empty: string;

  /** Le pied collé en pile : revenir sur le service retenu, en un mot. */
  readonly edit: string;

  /** Le pied collé en pile, panier vide : le bouton inactif le dit court. */
  readonly emptyShort: string;
  /** La barre sans service choisi : la question, là où le choix s'écrirait. */
  readonly unset: string;
  /** Le seul geste de la moitié gauche quand rien n'est choisi. */
  readonly choose: string;
}

export const COMMAND_TERMS_FR: CommandTermsCopy = {
  title: 'Ma commande',
  today: 'aujourd’hui',
  tomorrow: 'demain',
  changeHouse: 'Changer de maison',
  changeTime: 'Changer l’heure',
  pickup: 'Retrait',
  delivery: 'Livraison',
  pieceOne: '{n} pièce',
  pieceMany: '{n} pièces',
  discount: '−{amount} de remise',
  pay: 'Régler',
  empty: 'Panier vide — ajoutez depuis le rayon',
  edit: 'Modifier',
  emptyShort: 'Panier vide',
  unset: 'Où et quand ?',
  choose: 'Choisir la maison et l’heure',
};

export const COMMAND_TERMS_EN: CommandTermsCopy = {
  title: 'My order',
  today: 'today',
  tomorrow: 'tomorrow',
  changeHouse: 'Change bakery',
  changeTime: 'Change time',
  pickup: 'Pickup',
  delivery: 'Delivery',
  pieceOne: '{n} piece',
  pieceMany: '{n} pieces',
  discount: '−{amount} discount',
  pay: 'Pay',
  empty: 'Empty basket — add from the shelf',
  edit: 'Change',
  emptyShort: 'Empty basket',
  unset: 'Where and when?',
  choose: 'Choose the bakery and time',
};

export const COMMAND_TERMS_IT: CommandTermsCopy = {
  title: 'Il mio ordine',
  today: 'oggi',
  tomorrow: 'domani',
  changeHouse: 'Cambia bottega',
  changeTime: 'Cambia orario',
  pickup: 'Ritiro',
  delivery: 'Consegna',
  pieceOne: '{n} pezzo',
  pieceMany: '{n} pezzi',
  discount: '−{amount} di sconto',
  pay: 'Paga',
  empty: 'Carrello vuoto — aggiungi dallo scaffale',
  edit: 'Modifica',
  emptyShort: 'Carrello vuoto',
  unset: 'Dove e quando?',
  choose: 'Scegli la bottega e l’ora',
};

const DICTIONARIES: Readonly<Record<LocaleCode, CommandTermsCopy>> = {
  fr: COMMAND_TERMS_FR,
  en: COMMAND_TERMS_EN,
  it: COMMAND_TERMS_IT,
};

/** Le dictionnaire de la langue choisie. */
export function commandTermsCopy(locale: LocaleCode): CommandTermsCopy {
  return DICTIONARIES[locale];
}
