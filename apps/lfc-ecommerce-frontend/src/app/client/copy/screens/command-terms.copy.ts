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
   * Le jour retenu n'est plus demandable (la limite est passée pendant la
   * saisie) : `{day}` le jour retenu, `{next}` le premier encore possible.
   */
  readonly slipped: string;
  /**
   * La journée retenue précédait le premier jour commandable : la boutique
   * l'y a ramenée d'elle-même (plan `plan-premier-jour-commandable.md`, J4).
   * `{day}` la date d'ouverture en toutes lettres. Une seule formule, comme
   * {@link slipped} : elle vaut en retrait comme en livraison.
   */
  readonly firstDayMoved: string;
  /**
   * Le nom complet du « Modifier » de l'encadré du jour (2026-10-26) : le
   * texte visible est {@link edit}, et le nom le contient (RGAA 6.1).
   */
  readonly editDay: string;
  /**
   * Pourquoi le panier ne laisse pas régler : le jour retenu n'est plus
   * possible (heure limite passée, 2026-10-26).
   */
  readonly dayUnavailable: string;
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
  /**
   * 🔴 C'est la limite d'un ARTICLE du panier qui décide — plus stricte que la
   * générale pour ce jour (Hugo, 2026-10-21) : « Plus que 1 h 40 pour
   * commander un article de votre panier pour jeudi » — sans le nom de l'article
   * (Hugo, 2026-10-21 : l'article n'est pas sous les yeux). `{left}` et `{day}` comme {@link cutoffCountdown}.
   */
  readonly cutoffCountdownItem: string;
  /** La même chose, plus de six heures devant soi : `{day}`, `{time}`. */
  readonly cutoffCalmItem: string;
  /**
   * 🔴 La limite d'un ARTICLE du panier est déjà passée pour ce jour — la
   * passation le refuserait (Hugo, 2026-10-21) : « Un article de votre panier :
   * trop tard pour jeudi, possible à partir de samedi ». `{day}`, `{next}`.
   */
  readonly itemTooLate: string;
  /** La même chose, deux articles : `{next}` le jour le plus tardif. */
  readonly itemTooLateOther: string;
  /** La même chose, `{count}` articles (trois ou plus). */
  readonly itemTooLateOthers: string;

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
  /** Le même geste quand retrait ET livraison sont ouverts : la question du mode. */
  readonly chooseMode: string;
  /**
   * La barre qui ACCOMPAGNE le parcours (plan `plan-barre-qui-accompagne.md`) :
   * l'étape qui reste, à la place de « Régler ». Le jour, puis l'heure (ou
   * l'adresse, en livraison).
   */
  readonly chooseDay: string;
  readonly chooseTime: string;
  readonly chooseAddress: string;
}

export const COMMAND_TERMS_FR: CommandTermsCopy = {
  title: 'Ma commande',
  today: 'aujourd’hui',
  tomorrow: 'demain',
  changeHouse: 'Changer de maison',
  changeTime: 'Changer l’heure',
  changeAddress: 'Changer d’adresse',
  changeDay: 'Changer le jour',
  slipped:
    'Trop tard pour {day} : le premier jour encore possible est {next}. Changez le jour avant de régler.',
  editDay: 'Modifier le jour',
  dayUnavailable: 'Ce jour n’est plus possible : choisissez-en un autre avant de régler.',
  operationPickupFrom: 'Ce produit se retire à partir du {day}.',
  cutoffCountdown: 'Plus que {left} pour commander pour {day}.',
  cutoffLeftHoursMinutes: '{h} h {mm}',
  cutoffLeftHours: '{h} h',
  cutoffLeftMinutes: '{m} min',
  cutoffCalm: 'Pour {day}, commandez avant {time}.',
  cutoffCountdownItem: 'Plus que {left} pour commander un article de votre panier pour {day}.',
  cutoffCalmItem: 'Pour {day}, un article de votre panier se commande avant {time}.',
  itemTooLate: 'Un article de votre panier : trop tard pour {day}, possible à partir de {next}.',
  itemTooLateOther:
    '2 articles de votre panier : trop tard pour {day}, possible à partir de {next}.',
  itemTooLateOthers:
    '{count} articles de votre panier : trop tard pour {day}, possible à partir de {next}.',
  modeTitle: 'Retrait ou coursier ?',
  close: 'Fermer',
  firstDayMoved: 'Les commandes ouvrent le {day} : votre commande a été déplacée à cette date.',
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
  chooseMode: 'Retrait ou livraison ?',
  chooseDay: 'Choisissez le jour',
  chooseTime: 'Choisissez l’heure',
  chooseAddress: 'Choisissez l’adresse',
};

export const COMMAND_TERMS_EN: CommandTermsCopy = {
  title: 'My order',
  today: 'today',
  tomorrow: 'tomorrow',
  changeHouse: 'Change bakery',
  changeTime: 'Change time',
  changeAddress: 'Change address',
  changeDay: 'Change day',
  slipped: 'Too late for {day}: the first day still open is {next}. Change the day before paying.',
  editDay: 'Change the day',
  dayUnavailable: 'This day is no longer available: choose another one before paying.',
  operationPickupFrom: 'This product can be picked up from {day}.',
  cutoffCountdown: 'Only {left} left to order for {day}.',
  cutoffLeftHoursMinutes: '{h} h {mm} min',
  cutoffLeftHours: '{h} h',
  cutoffLeftMinutes: '{m} min',
  cutoffCalm: 'For {day}, order before {time}.',
  cutoffCountdownItem: 'Only {left} left to order an item in your basket for {day}.',
  cutoffCalmItem: 'For {day}, an item in your basket must be ordered before {time}.',
  itemTooLate: 'An item in your basket: too late for {day}, available from {next}.',
  itemTooLateOther: '2 items in your basket: too late for {day}, available from {next}.',
  itemTooLateOthers: '{count} items in your basket: too late for {day}, available from {next}.',
  modeTitle: 'Pickup or courier?',
  close: 'Close',
  firstDayMoved: 'Orders open on {day}: your order has been moved to that date.',
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
  chooseMode: 'Pickup or delivery?',
  chooseDay: 'Choose the day',
  chooseTime: 'Choose the time',
  chooseAddress: 'Choose the address',
};

export const COMMAND_TERMS_IT: CommandTermsCopy = {
  title: 'Il mio ordine',
  today: 'oggi',
  tomorrow: 'domani',
  changeHouse: 'Cambia bottega',
  changeTime: 'Cambia orario',
  changeAddress: 'Cambia indirizzo',
  changeDay: 'Cambia giorno',
  slipped:
    'Troppo tardi per {day}: il primo giorno ancora possibile è {next}. Cambiate il giorno prima di pagare.',
  editDay: 'Modifica il giorno',
  dayUnavailable: 'Questo giorno non è più possibile: sceglietene un altro prima di pagare.',
  operationPickupFrom: 'Questo prodotto si ritira a partire da {day}.',
  cutoffCountdown: 'Ancora {left} per ordinare per {day}.',
  cutoffLeftHoursMinutes: '{h} h {mm}',
  cutoffLeftHours: '{h} h',
  cutoffLeftMinutes: '{m} min',
  cutoffCalm: 'Per {day}, ordinate entro le {time}.',
  cutoffCountdownItem: 'Ancora {left} per ordinare un articolo del vostro carrello per {day}.',
  cutoffCalmItem: 'Per {day}, un articolo del vostro carrello va ordinato entro le {time}.',
  itemTooLate: 'Un articolo del vostro carrello: troppo tardi per {day}, possibile da {next}.',
  itemTooLateOther: '2 articoli del vostro carrello: troppo tardi per {day}, possibile da {next}.',
  itemTooLateOthers:
    '{count} articoli del vostro carrello: troppo tardi per {day}, possibile da {next}.',
  modeTitle: 'Ritiro o corriere?',
  close: 'Chiudi',
  firstDayMoved: 'Gli ordini aprono {day}: il vostro ordine è stato spostato a questa data.',
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
  chooseMode: 'Ritiro o consegna?',
  chooseDay: 'Scegliete il giorno',
  chooseTime: 'Scegliete l’ora',
  chooseAddress: 'Scegliete l’indirizzo',
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
