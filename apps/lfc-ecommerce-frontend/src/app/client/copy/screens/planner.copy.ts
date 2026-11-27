import type { PlannedColumnStatus } from '@lfd/contracts';

import type { LocaleCode } from '../../client-locale.service';

/**
 * **Ce que dit le planificateur de commandes** (`/planificateur`, plan
 * `documentation/commandes/planificateur/plan-planificateur-de-commandes.md`,
 * § 6.1 et § 6.2).
 *
 * Les phrases d'un article qui bloque ne sont pas ici : ce sont celles du
 * refus réel, que le serveur sert avec la vérification (§ 4 bis).
 */
export interface PlannerCopy {
  readonly title: string;
  readonly lead: string;
  readonly loading: string;
  readonly loadFailedTitle: string;
  readonly loadFailedBody: string;
  readonly retry: string;
  /** Le libellé de la date de départ. */
  readonly fromLabel: string;
  readonly pickup: string;
  /** `{city}` la ville livrée. */
  readonly deliveryTo: string;
  readonly noRoutingTitle: string;
  readonly noRouting: string;
  readonly chooseService: string;
  readonly favoritesTitle: string;
  readonly favoritesEmpty: string;
  readonly addItems: string;
  /** Au repos, sur un favori : `{days}` les jours où il ne passe pas. */
  readonly notOrderableOn: string;
  readonly addTo: string;
  /** Le nom du menu d'un favori : `{name}`. */
  readonly addToName: string;
  readonly moveTo: string;
  readonly remove: string;
  /** Le nom du menu d'une ligne : `{name}`. */
  readonly lineActionsName: string;
  readonly increaseName: string;
  readonly decreaseName: string;
  readonly addDay: string;
  readonly noMoreDays: string;
  readonly addSlot: string;
  readonly addSlotMenu: string;
  readonly noMoreSlots: string;
  readonly noSlotTitle: string;
  readonly noSlot: string;
  /** « avant 8 h » : un créneau sans borne basse. */
  readonly before: string;
  readonly slotColumn: string;
  readonly daysNav: string;
  /** `{amount}` le total HT. */
  readonly totalHt: string;
  readonly indicative: string;
  readonly totalPending: string;
  readonly totalFailed: string;
  readonly emptyCell: string;
  readonly dropHere: string;
  /** `{when}` l'instant de la commande. */
  readonly convertsAt: string;
  readonly convertsUnknown: string;
  readonly frozen: string;
  readonly states: Readonly<Record<Exclude<PlannedColumnStatus, 'draft'>, string>>;
  readonly viewOrder: string;
  readonly blockingOne: string;
  /** `{n}` le nombre d'articles. */
  readonly blockingMany: string;
  /** `{message}` la raison du refus. */
  readonly saveFailed: string;
  readonly reloaded: string;
  /** Le nom d'une case : `{day}` et `{slot}`. */
  readonly cellName: string;
}

const FR: PlannerCopy = {
  title: 'Planificateur',
  lead: 'Préparez vos commandes jour par jour : chaque case devient une commande quand ce jour ferme.',
  loading: 'Chargement du planificateur…',
  loadFailedTitle: 'Le planificateur n’a pas pu être chargé',
  loadFailedBody: 'Vérifiez votre connexion, puis réessayez.',
  retry: 'Réessayer',
  fromLabel: 'À partir du',
  pickup: 'Retrait',
  deliveryTo: 'Livraison à {city}',
  noRoutingTitle: 'Choisissez d’abord votre mode de service',
  noRouting: 'Le planificateur reprend le retrait ou la livraison choisis dans la boutique.',
  chooseService: 'Choisir dans la boutique',
  favoritesTitle: 'Favoris',
  favoritesEmpty: 'Aucun favori dans cet espace. Le cœur d’un article l’ajoute ici.',
  addItems: 'Ajouter des articles',
  notOrderableOn: 'Pas commandable {days}',
  addTo: 'Ajouter à…',
  addToName: 'Ajouter {name} à un jour',
  moveTo: 'Déplacer vers…',
  remove: 'Retirer',
  lineActionsName: 'Actions sur {name}',
  increaseName: 'Plus de {name}',
  decreaseName: 'Moins de {name}',
  addDay: 'Un jour de plus',
  noMoreDays: 'On ne prépare pas plus loin pour l’instant.',
  addSlot: 'Un créneau',
  addSlotMenu: 'Ajouter un créneau',
  noMoreSlots: 'Tous les créneaux sont déjà là.',
  noSlotTitle: 'Aucun créneau choisi',
  noSlot: 'Ajoutez un créneau : chaque créneau est une rangée, et chaque case une commande.',
  before: 'avant',
  slotColumn: 'Créneau',
  daysNav: 'Jours',
  totalHt: '{amount} HT',
  indicative: 'Prix indicatif',
  totalPending: 'Calcul du total…',
  totalFailed: 'Total indisponible',
  emptyCell: 'Glissez un favori ici, ou passez par « Ajouter à… ».',
  dropHere: 'Déposer ici',
  convertsAt: 'Se commande {when}',
  convertsUnknown: 'Heure de commande à venir',
  frozen: 'Ce jour se commande : modifiez la commande.',
  states: { placed: 'Commandée', refused: 'Non passée', missed: 'Manquée' },
  viewOrder: 'Voir la commande',
  blockingOne: '1 article empêche la commande',
  blockingMany: '{n} articles empêchent la commande',
  saveFailed: 'Ce changement n’a pas été enregistré : {message}',
  reloaded: 'Ce jour avait changé ailleurs : le planificateur a été relu.',
  cellName: '{day}, {slot}',
};

const EN: PlannerCopy = {
  title: 'Planner',
  lead: 'Prepare your orders day by day: each cell becomes an order when that day closes.',
  loading: 'Loading the planner…',
  loadFailedTitle: 'The planner could not be loaded',
  loadFailedBody: 'Check your connection, then try again.',
  retry: 'Try again',
  fromLabel: 'Starting on',
  pickup: 'Pickup',
  deliveryTo: 'Delivery to {city}',
  noRoutingTitle: 'First choose how you are served',
  noRouting: 'The planner uses the pickup or delivery chosen in the shop.',
  chooseService: 'Choose in the shop',
  favoritesTitle: 'Favourites',
  favoritesEmpty: 'No favourites in this space. An item’s heart adds it here.',
  addItems: 'Add items',
  notOrderableOn: 'Not orderable {days}',
  addTo: 'Add to…',
  addToName: 'Add {name} to a day',
  moveTo: 'Move to…',
  remove: 'Remove',
  lineActionsName: 'Actions on {name}',
  increaseName: 'More {name}',
  decreaseName: 'Less {name}',
  addDay: 'One more day',
  noMoreDays: 'You cannot plan further ahead for now.',
  addSlot: 'A time slot',
  addSlotMenu: 'Add a time slot',
  noMoreSlots: 'All time slots are already shown.',
  noSlotTitle: 'No time slot chosen',
  noSlot: 'Add a time slot: each slot is a row, and each cell an order.',
  before: 'before',
  slotColumn: 'Time slot',
  daysNav: 'Days',
  totalHt: '{amount} excl. VAT',
  indicative: 'Indicative price',
  totalPending: 'Working out the total…',
  totalFailed: 'Total unavailable',
  emptyCell: 'Drag a favourite here, or use “Add to…”.',
  dropHere: 'Drop here',
  convertsAt: 'Ordered {when}',
  convertsUnknown: 'Order time to come',
  frozen: 'This day is being ordered: change the order instead.',
  states: { placed: 'Ordered', refused: 'Not placed', missed: 'Missed' },
  viewOrder: 'View the order',
  blockingOne: '1 item prevents the order',
  blockingMany: '{n} items prevent the order',
  saveFailed: 'This change was not saved: {message}',
  reloaded: 'This day had changed elsewhere: the planner was reloaded.',
  cellName: '{day}, {slot}',
};

const IT: PlannerCopy = {
  title: 'Pianificatore',
  lead: 'Preparate i vostri ordini giorno per giorno: ogni casella diventa un ordine quando quel giorno chiude.',
  loading: 'Caricamento del pianificatore…',
  loadFailedTitle: 'Non è stato possibile caricare il pianificatore',
  loadFailedBody: 'Verificate la connessione, poi riprovate.',
  retry: 'Riprova',
  fromLabel: 'A partire dal',
  pickup: 'Ritiro',
  deliveryTo: 'Consegna a {city}',
  noRoutingTitle: 'Scegliete prima la modalità di servizio',
  noRouting: 'Il pianificatore riprende il ritiro o la consegna scelti nel negozio.',
  chooseService: 'Scegliere nel negozio',
  favoritesTitle: 'Preferiti',
  favoritesEmpty: 'Nessun preferito in questo spazio. Il cuore di un articolo lo aggiunge qui.',
  addItems: 'Aggiungere articoli',
  notOrderableOn: 'Non ordinabile {days}',
  addTo: 'Aggiungi a…',
  addToName: 'Aggiungi {name} a un giorno',
  moveTo: 'Sposta a…',
  remove: 'Togli',
  lineActionsName: 'Azioni su {name}',
  increaseName: 'Più {name}',
  decreaseName: 'Meno {name}',
  addDay: 'Un giorno in più',
  noMoreDays: 'Per ora non si pianifica oltre.',
  addSlot: 'Una fascia oraria',
  addSlotMenu: 'Aggiungi una fascia oraria',
  noMoreSlots: 'Tutte le fasce orarie sono già presenti.',
  noSlotTitle: 'Nessuna fascia oraria scelta',
  noSlot: 'Aggiungete una fascia oraria: ogni fascia è una riga, e ogni casella un ordine.',
  before: 'prima delle',
  slotColumn: 'Fascia oraria',
  daysNav: 'Giorni',
  totalHt: '{amount} IVA escl.',
  indicative: 'Prezzo indicativo',
  totalPending: 'Calcolo del totale…',
  totalFailed: 'Totale non disponibile',
  emptyCell: 'Trascinate qui un preferito, oppure usate «Aggiungi a…».',
  dropHere: 'Rilasciare qui',
  convertsAt: 'Ordinato {when}',
  convertsUnknown: 'Ora dell’ordine da definire',
  frozen: 'Questo giorno è in ordinazione: modificate l’ordine.',
  states: { placed: 'Ordinato', refused: 'Non passato', missed: 'Mancato' },
  viewOrder: 'Vedi l’ordine',
  blockingOne: '1 articolo impedisce l’ordine',
  blockingMany: '{n} articoli impediscono l’ordine',
  saveFailed: 'Questa modifica non è stata salvata: {message}',
  reloaded: 'Questo giorno era cambiato altrove: il pianificatore è stato ricaricato.',
  cellName: '{day}, {slot}',
};

const DICTIONARIES: Record<LocaleCode, PlannerCopy> = { fr: FR, en: EN, it: IT };

/** Les textes du planificateur, dans la langue choisie. */
export function plannerCopy(locale: LocaleCode): PlannerCopy {
  return DICTIONARIES[locale];
}
