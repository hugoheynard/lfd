import type { Recurrence, RecurringOccurrenceState } from '@lfd/contracts';

import type { LocaleCode } from '../../client-locale.service';

/**
 * **Ce que dit la page « Mes paniers récurrents »** (`/paniers-recurrents`)
 * et le dialogue qui modifie une échéance (plan
 * `documentation/commandes/paniers-recurrents/plan-bloc-recurrent.md`, § 5 et § 7).
 *
 * Une échéance refusée ou manquée ne dit jamais pourquoi : la cause est
 * écrite pour l'équipe, qui reprend contact (décision du plan, § 12).
 */
export interface RecurringBasketsCopy {
  /** Le bandeau de la page. */
  readonly title: string;
  readonly lead: string;
  readonly loading: string;
  readonly loadFailedTitle: string;
  readonly loadFailedBody: string;
  readonly retry: string;
  readonly noneTitle: string;
  readonly none: string;
  /** Le rythme, en titre de la carte. */
  readonly recurrence: Readonly<Record<Recurrence, string>>;
  readonly statusActive: string;
  readonly statusPaused: string;
  /** Ce que dit un panier en pause, en plus de sa pastille. */
  readonly pausedNote: string;
  /** `{start}` le premier jour. */
  readonly since: string;
  /** `{start}` et `{end}`. */
  readonly between: string;
  readonly pickup: string;
  readonly delivery: string;
  readonly slotLabel: string;
  /** « avant 8 h » : un créneau sans borne basse. */
  readonly before: string;
  readonly noSlot: string;
  readonly linesLabel: string;
  readonly noteLabel: string;
  readonly pause: string;
  readonly resume: string;
  readonly stop: string;
  readonly stopMessage: string;
  readonly stopConfirm: string;
  readonly cancel: string;
  readonly busy: string;
  readonly confirmGroup: string;
  /** `{date}` la date d'effet des nouvelles CGV. */
  readonly newTerms: string;
  readonly termsLink: string;
  /** `{name}` le lien : il s'ouvre dans un nouvel onglet (RGAA 13.2). */
  readonly newTab: string;
  readonly upcomingTitle: string;
  readonly noUpcoming: string;
  readonly pastTitle: string;
  /** L'état d'une échéance tel qu'on le lit — `refused` et `missed` disent la même chose. */
  readonly states: Readonly<Record<Exclude<RecurringOccurrenceState, 'cancelled'>, string>>;
  readonly overridden: string;
  readonly notPlaced: string;
  readonly skip: string;
  readonly modify: string;
  readonly restore: string;
  readonly viewOrder: string;
  /** Les noms accessibles des gestes d'une échéance : `{day}`. */
  readonly skipName: string;
  readonly modifyName: string;
  readonly restoreName: string;
  readonly viewOrderName: string;
  /** `{message}` la raison du refus. */
  readonly gestureFailed: string;
  readonly announcePaused: string;
  readonly announceResumed: string;
  readonly announceStopped: string;
  readonly announceSkipped: string;
  readonly announceModified: string;
  readonly announceRestored: string;
  /** Le dialogue d'une échéance : `{day}`. */
  readonly dialogTitle: string;
  readonly dialogLead: string;
  readonly removeHint: string;
  readonly atLeastOne: string;
  readonly save: string;
  readonly close: string;
}

const FR: RecurringBasketsCopy = {
  title: 'Mes paniers récurrents',
  lead: 'Vos commandes qui se répètent, et les prochaines qu’elles passeront.',
  loading: 'Chargement de vos paniers…',
  loadFailedTitle: 'Vos paniers n’ont pas pu être chargés',
  loadFailedBody: 'Vérifiez votre connexion, puis réessayez.',
  retry: 'Réessayer',
  noneTitle: 'Aucun panier récurrent',
  none: 'Depuis une commande passée, vous pouvez la répéter chaque semaine ou chaque mois.',
  recurrence: {
    weekly: 'Chaque semaine',
    biweekly: 'Toutes les deux semaines',
    monthly: 'Chaque mois',
  },
  statusActive: 'Actif',
  statusPaused: 'En pause',
  pausedNote:
    'Ce panier est en pause : aucune commande n’est passée tant que vous ne le reprenez pas.',
  since: 'Depuis le {start}',
  between: 'Du {start} au {end}',
  pickup: 'Retrait',
  delivery: 'Livraison',
  slotLabel: 'Créneau',
  before: 'avant',
  noSlot: 'à préciser',
  linesLabel: 'Le panier',
  noteLabel: 'Note',
  pause: 'Mettre en pause',
  resume: 'Reprendre',
  stop: 'Arrêter le panier',
  stopMessage: 'Plus aucune commande ne sera passée pour ce panier. Ce geste est définitif.',
  stopConfirm: 'Arrêter',
  cancel: 'Annuler',
  busy: 'Un instant…',
  confirmGroup: 'Confirmer l’arrêt du panier',
  newTerms: 'Nouvelles conditions générales à partir du {date}.',
  termsLink: 'Lire les conditions générales de vente',
  newTab: '{name} (nouvel onglet)',
  upcomingTitle: 'Mes prochaines commandes',
  noUpcoming: 'Aucune commande prévue pour le moment.',
  pastTitle: 'Les semaines passées',
  states: {
    planned: 'Prévue',
    skipped: 'Sautée',
    placed: 'Passée',
    refused: 'Non passée',
    missed: 'Non passée',
  },
  overridden: 'Modifiée',
  notPlaced: 'Cette commande n’a pas pu être passée : nous vous contactons.',
  skip: 'Sauter',
  modify: 'Modifier',
  restore: 'Rétablir',
  viewOrder: 'Voir la commande',
  skipName: 'Sauter la commande du {day}',
  modifyName: 'Modifier la commande du {day}',
  restoreName: 'Rétablir la commande du {day}',
  viewOrderName: 'Voir la commande du {day}',
  gestureFailed: 'Ce changement n’a pas été enregistré : {message}',
  announcePaused: 'Panier mis en pause.',
  announceResumed: 'Panier repris.',
  announceStopped: 'Panier arrêté.',
  announceSkipped: 'Commande sautée.',
  announceModified: 'Commande modifiée.',
  announceRestored: 'Commande rétablie.',
  dialogTitle: 'Modifier la commande du {day}',
  dialogLead: 'Seule cette commande change : les suivantes gardent votre panier habituel.',
  removeHint: 'Une quantité à 0 retire l’article de cette commande.',
  atLeastOne: 'Gardez au moins un article, ou sautez cette commande.',
  save: 'Enregistrer',
  close: 'Fermer',
};

const EN: RecurringBasketsCopy = {
  title: 'My recurring baskets',
  lead: 'Your repeating orders, and the next ones they will place.',
  loading: 'Loading your baskets…',
  loadFailedTitle: 'Your baskets could not be loaded',
  loadFailedBody: 'Check your connection, then try again.',
  retry: 'Try again',
  noneTitle: 'No recurring basket',
  none: 'From a past order, you can repeat it every week or every month.',
  recurrence: {
    weekly: 'Every week',
    biweekly: 'Every two weeks',
    monthly: 'Every month',
  },
  statusActive: 'Active',
  statusPaused: 'Paused',
  pausedNote: 'This basket is paused: no order is placed until you resume it.',
  since: 'Since {start}',
  between: 'From {start} to {end}',
  pickup: 'Pickup',
  delivery: 'Delivery',
  slotLabel: 'Time slot',
  before: 'before',
  noSlot: 'to be set',
  linesLabel: 'The basket',
  noteLabel: 'Note',
  pause: 'Pause',
  resume: 'Resume',
  stop: 'Stop the basket',
  stopMessage: 'No further order will be placed for this basket. This cannot be undone.',
  stopConfirm: 'Stop',
  cancel: 'Cancel',
  busy: 'One moment…',
  confirmGroup: 'Confirm stopping the basket',
  newTerms: 'New terms and conditions from {date}.',
  termsLink: 'Read the terms and conditions of sale',
  newTab: '{name} (new tab)',
  upcomingTitle: 'My next orders',
  noUpcoming: 'No order planned for now.',
  pastTitle: 'Past weeks',
  states: {
    planned: 'Planned',
    skipped: 'Skipped',
    placed: 'Placed',
    refused: 'Not placed',
    missed: 'Not placed',
  },
  overridden: 'Changed',
  notPlaced: 'This order could not be placed: we will contact you.',
  skip: 'Skip',
  modify: 'Change',
  restore: 'Restore',
  viewOrder: 'View the order',
  skipName: 'Skip the order of {day}',
  modifyName: 'Change the order of {day}',
  restoreName: 'Restore the order of {day}',
  viewOrderName: 'View the order of {day}',
  gestureFailed: 'This change was not saved: {message}',
  announcePaused: 'Basket paused.',
  announceResumed: 'Basket resumed.',
  announceStopped: 'Basket stopped.',
  announceSkipped: 'Order skipped.',
  announceModified: 'Order changed.',
  announceRestored: 'Order restored.',
  dialogTitle: 'Change the order of {day}',
  dialogLead: 'Only this order changes: the next ones keep your usual basket.',
  removeHint: 'A quantity of 0 removes the item from this order.',
  atLeastOne: 'Keep at least one item, or skip this order.',
  save: 'Save',
  close: 'Close',
};

const IT: RecurringBasketsCopy = {
  title: 'I miei carrelli ricorrenti',
  lead: 'I vostri ordini che si ripetono, e i prossimi che verranno passati.',
  loading: 'Caricamento dei vostri carrelli…',
  loadFailedTitle: 'Non è stato possibile caricare i vostri carrelli',
  loadFailedBody: 'Verificate la connessione, poi riprovate.',
  retry: 'Riprova',
  noneTitle: 'Nessun carrello ricorrente',
  none: 'Da un ordine passato, potete ripeterlo ogni settimana o ogni mese.',
  recurrence: {
    weekly: 'Ogni settimana',
    biweekly: 'Ogni due settimane',
    monthly: 'Ogni mese',
  },
  statusActive: 'Attivo',
  statusPaused: 'In pausa',
  pausedNote: 'Questo carrello è in pausa: nessun ordine viene passato finché non lo riprendete.',
  since: 'Dal {start}',
  between: 'Dal {start} al {end}',
  pickup: 'Ritiro',
  delivery: 'Consegna',
  slotLabel: 'Fascia oraria',
  before: 'prima delle',
  noSlot: 'da definire',
  linesLabel: 'Il carrello',
  noteLabel: 'Nota',
  pause: 'Metti in pausa',
  resume: 'Riprendi',
  stop: 'Interrompi il carrello',
  stopMessage: 'Nessun altro ordine verrà passato per questo carrello. L’azione è definitiva.',
  stopConfirm: 'Interrompi',
  cancel: 'Annulla',
  busy: 'Un attimo…',
  confirmGroup: 'Conferma l’interruzione del carrello',
  newTerms: 'Nuove condizioni generali a partire dal {date}.',
  termsLink: 'Leggi le condizioni generali di vendita',
  newTab: '{name} (nuova scheda)',
  upcomingTitle: 'I miei prossimi ordini',
  noUpcoming: 'Nessun ordine previsto per ora.',
  pastTitle: 'Le settimane passate',
  states: {
    planned: 'Previsto',
    skipped: 'Saltato',
    placed: 'Passato',
    refused: 'Non passato',
    missed: 'Non passato',
  },
  overridden: 'Modificato',
  notPlaced: 'Non è stato possibile passare questo ordine: vi contatteremo.',
  skip: 'Salta',
  modify: 'Modifica',
  restore: 'Ripristina',
  viewOrder: 'Vedi l’ordine',
  skipName: 'Salta l’ordine del {day}',
  modifyName: 'Modifica l’ordine del {day}',
  restoreName: 'Ripristina l’ordine del {day}',
  viewOrderName: 'Vedi l’ordine del {day}',
  gestureFailed: 'Questa modifica non è stata registrata: {message}',
  announcePaused: 'Carrello messo in pausa.',
  announceResumed: 'Carrello ripreso.',
  announceStopped: 'Carrello interrotto.',
  announceSkipped: 'Ordine saltato.',
  announceModified: 'Ordine modificato.',
  announceRestored: 'Ordine ripristinato.',
  dialogTitle: 'Modifica l’ordine del {day}',
  dialogLead: 'Cambia solo questo ordine: i successivi mantengono il carrello abituale.',
  removeHint: 'Una quantità a 0 toglie l’articolo da questo ordine.',
  atLeastOne: 'Tenete almeno un articolo, oppure saltate questo ordine.',
  save: 'Salva',
  close: 'Chiudi',
};

const DICTIONARIES: Record<LocaleCode, RecurringBasketsCopy> = { fr: FR, en: EN, it: IT };

/** Les textes de « Mes paniers récurrents », dans la langue choisie. */
export function recurringBasketsCopy(locale: LocaleCode): RecurringBasketsCopy {
  return DICTIONARIES[locale];
}
