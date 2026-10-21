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

  /**
   * Les deux gestes en LIVRAISON (Hugo, 2026-10-13 : « je n'ai que changer de
   * maison même si je suis en livraison ») : on n'y choisit ni maison ni heure
   * de fournée, mais une adresse et un jour.
   */
  readonly changeAddress: string;
  readonly changeDay: string;

  /**
   * 🔴 Le jour de service n'est PAS demain (Hugo, 2026-10-13 : « je croyais
   * commander pour demain et au final j'ai deux commandes pour jeudi »).
   * `{day}` est TOUJOURS un jour dit en mot — « jeudi 15 octobre ».
   */
  readonly lateDelivery: string;
  readonly latePickup: string;
  /**
   * Le jour retenu n'est plus demandable (la limite est passée pendant la
   * saisie) : `{day}` le jour retenu, `{next}` le premier encore possible.
   */
  readonly slipped: string;
  /**
   * La même chose, quand on a lu l'heure limite de demain avant qu'elle tombe :
   * `{time}` l'heure passée — « 23 h » —, `{day}` le jour de service.
   */
  readonly lateDeliveryAt: string;
  readonly latePickupAt: string;
  /**
   * Le panier porte une opération datée : c'est ELLE qui repousse le jour, pas
   * l'heure limite. `{day}` le premier jour de retrait.
   */
  readonly operationPickupFrom: string;
  /**
   * 🔴 Prévenir AVANT « trop tard pour demain » (Hugo, 2026-10-21) : la limite
   * du premier jour tombe aujourd'hui. `{left}` une durée composée de l'un des
   * trois `cutoffLeft*`, `{day}` le jour de la semaine.
   */
  readonly cutoffCountdown: string;
  /** `{h}` heures et `{mm}` minutes sur deux chiffres. */
  readonly cutoffLeftHoursMinutes: string;
  /** `{h}` heures rondes. */
  readonly cutoffLeftHours: string;
  /** `{m}` minutes, sous l'heure. */
  readonly cutoffLeftMinutes: string;
  /** Plus de six heures devant soi : `{day}` le jour, `{time}` l'heure limite. */
  readonly cutoffCalm: string;

  /** La question qui précède les deux portes quand rien n'est choisi (O6, 2026-10-13). */
  readonly modeTitle: string;
  /** Fermer cette question. */
  readonly close: string;

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
  changeAddress: 'Changer d’adresse',
  changeDay: 'Changer le jour',
  lateDelivery: 'Trop tard pour demain : votre commande sera livrée {day}.',
  latePickup: 'Trop tard pour demain : votre commande sera à retirer {day}.',
  slipped:
    'Trop tard pour {day} : le premier jour encore possible est {next}. Changez le jour avant de régler.',
  lateDeliveryAt:
    'Trop tard pour demain, la limite était {time} : votre commande sera livrée {day}.',
  latePickupAt:
    'Trop tard pour demain, la limite était {time} : votre commande sera à retirer {day}.',
  operationPickupFrom: 'Ce produit se retire à partir du {day}.',
  cutoffCountdown: 'Plus que {left} pour commander pour {day}.',
  cutoffLeftHoursMinutes: '{h} h {mm}',
  cutoffLeftHours: '{h} h',
  cutoffLeftMinutes: '{m} min',
  cutoffCalm: 'Pour {day}, commandez avant {time}.',
  modeTitle: 'Retrait ou coursier ?',
  close: 'Fermer',
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
  changeAddress: 'Change address',
  changeDay: 'Change day',
  lateDelivery: 'Too late for tomorrow: your order will be delivered on {day}.',
  latePickup: 'Too late for tomorrow: your order will be ready for pickup on {day}.',
  slipped: 'Too late for {day}: the first day still open is {next}. Change the day before paying.',
  lateDeliveryAt:
    'Too late for tomorrow, orders closed at {time}: your order will be delivered on {day}.',
  latePickupAt:
    'Too late for tomorrow, orders closed at {time}: your order will be ready for pickup on {day}.',
  operationPickupFrom: 'This product can be picked up from {day}.',
  cutoffCountdown: 'Only {left} left to order for {day}.',
  cutoffLeftHoursMinutes: '{h} h {mm} min',
  cutoffLeftHours: '{h} h',
  cutoffLeftMinutes: '{m} min',
  cutoffCalm: 'For {day}, order before {time}.',
  modeTitle: 'Pickup or courier?',
  close: 'Close',
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
  changeAddress: 'Cambia indirizzo',
  changeDay: 'Cambia giorno',
  lateDelivery: 'Troppo tardi per domani: il vostro ordine sarà consegnato {day}.',
  latePickup: 'Troppo tardi per domani: il vostro ordine sarà da ritirare {day}.',
  slipped:
    'Troppo tardi per {day}: il primo giorno ancora possibile è {next}. Cambiate il giorno prima di pagare.',
  lateDeliveryAt:
    'Troppo tardi per domani, il limite era alle {time}: il vostro ordine sarà consegnato {day}.',
  latePickupAt:
    'Troppo tardi per domani, il limite era alle {time}: il vostro ordine sarà da ritirare {day}.',
  operationPickupFrom: 'Questo prodotto si ritira a partire da {day}.',
  cutoffCountdown: 'Ancora {left} per ordinare per {day}.',
  cutoffLeftHoursMinutes: '{h} h {mm}',
  cutoffLeftHours: '{h} h',
  cutoffLeftMinutes: '{m} min',
  cutoffCalm: 'Per {day}, ordinate entro le {time}.',
  modeTitle: 'Ritiro o corriere?',
  close: 'Chiudi',
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
