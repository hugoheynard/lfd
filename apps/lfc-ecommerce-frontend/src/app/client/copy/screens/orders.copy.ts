import {
  ORDER_CHANGE_REQUEST_EN,
  ORDER_CHANGE_REQUEST_FR,
  ORDER_CHANGE_REQUEST_IT,
  type OrderChangeRequestCopy,
} from './order-change-request.copy';
import {
  ORDER_SUMMARY_EN,
  ORDER_SUMMARY_FR,
  ORDER_SUMMARY_IT,
  type OrderSummaryCopy,
} from './order-summary.copy';

/**
 * **Modifier une commande passée** — le bouton du tiroir et l'écran de
 * modification (plan `documentation/commandes/modification/plan-modifier-une-commande.md`,
 * M3). Rangé ici plutôt que dans un fichier d'écran à lui : un nouveau fichier
 * de `screens/` est une ligne de plus au recueil (`dev-toolbox/shop-copy/spaces.mjs`),
 * et ces textes appartiennent à « Mes commandes ».
 *
 * Les refus du serveur ne sont PAS ici : ils se disent par leur message, que
 * le serveur écrit pour le client (`orders.revise.*`).
 */
export interface OrderReviseCopy {
  /** Le bouton du tiroir, à côté d'« Annuler ». */
  readonly reviseAction: string;
  /** Ce que dit le tiroir d'une commande réglée par carte, à la place du bouton. */
  readonly reviseCardNote: string;
  /** Sous le bouton : `{when}` reçoit l'heure limite (« 14/10 à 18:00 »). */
  readonly reviseUntil: string;
  /** La mise en forme de l'heure limite : `{day}` et `{time}`. */
  readonly reviseWhen: string;
  /** Le fournil l'a déjà comptée (ou le plan du jour est arrêté). */
  readonly refusedInPreparation: string;
  /** L'heure limite est passée, sans échéance connue. */
  readonly refusedTooLate: string;
  /** L'heure limite est passée : `{when}` reçoit celle qui l'est. */
  readonly refusedTooLateUntil: string;
  /** Déjà facturée ou prélevée. */
  readonly refusedAccounting: string;
  /** Un remboursement attend son issue. */
  readonly refusedPaymentInProgress: string;
  /** Tout autre refus : la boutique propose de nous contacter. */
  readonly refusedUnavailable: string;
  /** `{reference}` reçoit le numéro de la commande. */
  readonly reviseKicker: string;
  readonly reviseTitle: string;
  readonly reviseLead: string;
  readonly loadingOrder: string;
  readonly loadFailedTitle: string;
  readonly reloadCta: string;
  readonly backToOrders: string;
  readonly linesTitle: string;
  readonly addLabel: string;
  readonly addPlaceholder: string;
  readonly addNone: string;
  /** Une ligne déjà dans la commande : elle garde son prix. */
  readonly priceKept: string;
  /** Une ligne ajoutée : au prix du jour. */
  readonly priceToday: string;
  /** `{name}` reçoit le nom de l'article. */
  readonly removeAria: string;
  readonly noLinesNote: string;
  readonly serviceTitle: string;
  /** `{place}` reçoit le nom du point de retrait. */
  readonly servicePickup: string;
  /** `{address}` reçoit l'adresse livrée. */
  readonly serviceDelivery: string;
  /** `{day}` et `{slot}` : « demain, 7 h – 8 h ». */
  readonly serviceWhen: string;
  readonly pickupToChoose: string;
  readonly changeServiceCta: string;
  readonly changeTimeCta: string;
  readonly quoteTitle: string;
  readonly quotingMessage: string;
  readonly quoteFailedNote: string;
  readonly totalNew: string;
  readonly totalPrevious: string;
  readonly differenceLabel: string;
  /** `{amount}` reçoit l'écart mis en forme. */
  readonly differenceMore: string;
  /** `{amount}` reçoit l'écart mis en forme. */
  readonly differenceLess: string;
  readonly differenceNone: string;
  readonly taxIncluded: string;
  readonly unchangedNote: string;
  readonly submitCta: string;
  readonly submittingCta: string;
  /** Le repli d'un refus dont le serveur n'a pas dit la phrase. */
  readonly revisionRefused: string;
  readonly revisedToast: string;
  /** Après l'heure limite : demander plutôt que modifier (M4). */
  readonly request: OrderChangeRequestCopy;
}

const ORDER_REVISE_FR: OrderReviseCopy = {
  reviseAction: 'Modifier ma commande',
  reviseCardNote:
    'Commande réglée par carte : pour la modifier, annulez-la et recommandez, ou demandez-nous.',
  reviseUntil: 'Modifiable jusqu’au {when}.',
  reviseWhen: '{day} à {time}',
  refusedInPreparation: 'Votre commande est déjà en préparation : elle ne se modifie plus.',
  refusedTooLate:
    'L’heure limite est passée : la commande ne se modifie plus en ligne. Contactez-nous.',
  refusedTooLateUntil:
    'L’heure limite est passée : il était possible de la modifier jusqu’au {when}. Contactez-nous.',
  refusedAccounting:
    'Cette commande est déjà facturée : elle ne se modifie plus en ligne. Contactez-nous.',
  refusedPaymentInProgress:
    'Un remboursement est en cours sur cette commande : réessayez dans quelques minutes.',
  refusedUnavailable: 'Cette commande ne peut pas être modifiée en ligne. Contactez-nous.',
  reviseKicker: 'Commande {reference}',
  reviseTitle: 'Modifier ma commande',
  reviseLead:
    'Changez les articles, les quantités, le jour ou le mode. Le nouveau total s’affiche avant de valider.',
  loadingOrder: 'Lecture de la commande…',
  loadFailedTitle: 'La commande n’a pas pu être lue.',
  reloadCta: 'Recharger',
  backToOrders: 'Retour à mes commandes',
  linesTitle: 'Les articles',
  addLabel: 'Ajouter un article',
  addPlaceholder: 'Chercher dans la boutique',
  addNone: 'Aucun article',
  priceKept: 'prix d’origine',
  priceToday: 'prix du jour',
  removeAria: 'Retirer {name}',
  noLinesNote:
    'Une commande garde au moins un article : pour tout retirer, annulez-la depuis Mes commandes.',
  serviceTitle: 'Retrait ou livraison',
  servicePickup: 'Retrait — {place}',
  serviceDelivery: 'Livraison — {address}',
  serviceWhen: '{day}, {slot}',
  pickupToChoose:
    'Choisissez le point de retrait : la commande ne nous a pas permis de le retrouver.',
  changeServiceCta: 'Changer',
  changeTimeCta: 'Changer l’heure',
  quoteTitle: 'Le nouveau total',
  quotingMessage: 'Calcul du nouveau total…',
  quoteFailedNote: 'Le nouveau total n’a pas pu être calculé. Réessayez dans un instant.',
  totalNew: 'Nouveau total',
  totalPrevious: 'Total actuel',
  differenceLabel: 'Écart',
  differenceMore: '+ {amount}',
  differenceLess: '− {amount}',
  differenceNone: 'Aucun écart',
  taxIncluded: 'TTC',
  unchangedNote: 'Rien n’a encore changé.',
  submitCta: 'Valider la modification',
  submittingCta: 'Envoi…',
  revisionRefused: 'La modification n’a pas pu être enregistrée.',
  revisedToast: 'Votre commande est modifiée.',
  request: ORDER_CHANGE_REQUEST_FR,
};

const ORDER_REVISE_EN: OrderReviseCopy = {
  reviseAction: 'Change my order',
  reviseCardNote: 'Order paid by card: to change it, cancel it and order again, or ask us.',
  reviseUntil: 'Can be changed until {when}.',
  reviseWhen: '{day} at {time}',
  refusedInPreparation: 'Your order is already being prepared: it can no longer be changed.',
  refusedTooLate: 'The deadline has passed: the order can no longer be changed online. Contact us.',
  refusedTooLateUntil:
    'The deadline has passed: the order could be changed until {when}. Contact us.',
  refusedAccounting:
    'This order has already been invoiced: it can no longer be changed online. Contact us.',
  refusedPaymentInProgress: 'A refund is in progress on this order: try again in a few minutes.',
  refusedUnavailable: 'This order cannot be changed online. Contact us.',
  reviseKicker: 'Order {reference}',
  reviseTitle: 'Change my order',
  reviseLead:
    'Change the items, the quantities, the day or the mode. The new total shows before you confirm.',
  loadingOrder: 'Reading the order…',
  loadFailedTitle: 'The order could not be read.',
  reloadCta: 'Reload',
  backToOrders: 'Back to my orders',
  linesTitle: 'Items',
  addLabel: 'Add an item',
  addPlaceholder: 'Search the shop',
  addNone: 'No item',
  priceKept: 'original price',
  priceToday: 'today’s price',
  removeAria: 'Remove {name}',
  noLinesNote: 'An order keeps at least one item: to remove everything, cancel it from My orders.',
  serviceTitle: 'Pickup or delivery',
  servicePickup: 'Pickup — {place}',
  serviceDelivery: 'Delivery — {address}',
  serviceWhen: '{day}, {slot}',
  pickupToChoose: 'Choose the pickup point: we could not find it from the order.',
  changeServiceCta: 'Change',
  changeTimeCta: 'Change the time',
  quoteTitle: 'The new total',
  quotingMessage: 'Working out the new total…',
  quoteFailedNote: 'The new total could not be worked out. Try again in a moment.',
  totalNew: 'New total',
  totalPrevious: 'Current total',
  differenceLabel: 'Difference',
  differenceMore: '+ {amount}',
  differenceLess: '− {amount}',
  differenceNone: 'No difference',
  taxIncluded: 'incl. VAT',
  unchangedNote: 'Nothing has changed yet.',
  submitCta: 'Confirm the change',
  submittingCta: 'Sending…',
  revisionRefused: 'The change could not be saved.',
  revisedToast: 'Your order has been changed.',
  request: ORDER_CHANGE_REQUEST_EN,
};

const ORDER_REVISE_IT: OrderReviseCopy = {
  reviseAction: 'Modifica il mio ordine',
  reviseCardNote:
    'Ordine pagato con carta: per modificarlo, annullalo e ordina di nuovo, oppure chiedi a noi.',
  reviseUntil: 'Modificabile fino al {when}.',
  reviseWhen: '{day} alle {time}',
  refusedInPreparation: 'Il tuo ordine è già in preparazione: non si può più modificare.',
  refusedTooLate:
    'L’orario limite è passato: l’ordine non si può più modificare online. Contattaci.',
  refusedTooLateUntil:
    'L’orario limite è passato: era possibile modificarlo fino al {when}. Contattaci.',
  refusedAccounting:
    'Questo ordine è già stato fatturato: non si può più modificare online. Contattaci.',
  refusedPaymentInProgress: 'Un rimborso è in corso su questo ordine: riprova tra qualche minuto.',
  refusedUnavailable: 'Questo ordine non si può modificare online. Contattaci.',
  reviseKicker: 'Ordine {reference}',
  reviseTitle: 'Modifica il mio ordine',
  reviseLead:
    'Cambia gli articoli, le quantità, il giorno o la modalità. Il nuovo totale appare prima di confermare.',
  loadingOrder: 'Lettura dell’ordine…',
  loadFailedTitle: 'Non è stato possibile leggere l’ordine.',
  reloadCta: 'Ricarica',
  backToOrders: 'Torna ai miei ordini',
  linesTitle: 'Gli articoli',
  addLabel: 'Aggiungi un articolo',
  addPlaceholder: 'Cerca nel negozio',
  addNone: 'Nessun articolo',
  priceKept: 'prezzo originale',
  priceToday: 'prezzo del giorno',
  removeAria: 'Rimuovi {name}',
  noLinesNote:
    'Un ordine conserva almeno un articolo: per togliere tutto, annullalo da I miei ordini.',
  serviceTitle: 'Ritiro o consegna',
  servicePickup: 'Ritiro — {place}',
  serviceDelivery: 'Consegna — {address}',
  serviceWhen: '{day}, {slot}',
  pickupToChoose: 'Scegli il punto di ritiro: non siamo riusciti a ritrovarlo dall’ordine.',
  changeServiceCta: 'Cambia',
  changeTimeCta: 'Cambia l’orario',
  quoteTitle: 'Il nuovo totale',
  quotingMessage: 'Calcolo del nuovo totale…',
  quoteFailedNote: 'Non è stato possibile calcolare il nuovo totale. Riprova tra un attimo.',
  totalNew: 'Nuovo totale',
  totalPrevious: 'Totale attuale',
  differenceLabel: 'Differenza',
  differenceMore: '+ {amount}',
  differenceLess: '− {amount}',
  differenceNone: 'Nessuna differenza',
  taxIncluded: 'IVA inclusa',
  unchangedNote: 'Non è ancora cambiato nulla.',
  submitCta: 'Conferma la modifica',
  submittingCta: 'Invio…',
  revisionRefused: 'Non è stato possibile registrare la modifica.',
  revisedToast: 'Il tuo ordine è stato modificato.',
  request: ORDER_CHANGE_REQUEST_IT,
};

/**
 * Ce que dit `/mes-commandes`, dans les trois langues.
 *
 * L'interface et ses trois dictionnaires vivent dans le MÊME fichier, et c'est
 * délibéré : le garde-fou du dossier — ajouter une phrase casse la compilation
 * tant que les trois langues ne l'ont pas — tient toujours, et il tient sous les
 * yeux. Le dictionnaire général les rassemble sans les héberger : à trois écrans
 * de plus, il dépassait les 600 lignes et personne n'y relisait plus rien.
 *
 * Les libellés d'ÉTAT sont ici et pas dans la donnée : une commande porte un
 * statut, pas un mot français. C'est ce qui permet à l'italien de lire
 * « Ritirato » sans que la commande, elle, change.
 */
export interface OrdersCopy {
  readonly title: string;
  readonly lead: string;
  /** Le sur-titre du bandeau — `{n}` est remplacé par le nombre de suivis. */
  readonly liveCount: string;
  readonly wellHead: string;
  /**
   * Le compte, sous le titre du puits — `{n}` commandes vivantes.
   *
   * Il ne dit plus « faites glisser » : le débordement de la troisième carte le
   * montre déjà, et une consigne de geste sous un titre lit comme une notice.
   */
  readonly wellHint: string;
  /** Le libellé d'un point de défilement — `{n}` est le rang du suivi. */
  readonly wellDot: string;
  /**
   * La sortie du puits vers l'historique, sur l'ACCUEIL.
   *
   * Elle n'existe pas sur « Mes commandes » : on y est déjà, et un bouton qui
   * mène là où l'on se trouve est une impasse dessinée.
   */
  readonly wellAll: string;
  readonly wellNone: string;
  readonly wellNoneHint: string;
  /** `{n}` est remplacé par l'avancement en pour-cent. */
  readonly progress: string;
  readonly qr: string;
  readonly qrLong: string;
  /** L'avion en papier : envoyer le QR à qui passera le prendre. */
  readonly qrSend: string;
  readonly courierCall: string;
  readonly courierTrack: string;
  /** `{name}` est remplacé par le prénom du coursier. */
  readonly courierOnWay: string;
  readonly courierPending: string;
  readonly historyHead: string;
  readonly historyNote: string;
  readonly colOrder: string;
  readonly colMode: string;
  readonly colDate: string;
  readonly colStatus: string;
  readonly colPayment: string;
  readonly colTotal: string;
  /**
   * Le site d'une commande — la colonne n'apparaît que si la liste en porte
   * (le compte principal, plan `plan-commandes-des-sites.md`, C2).
   */
  readonly colSite: string;
  /** Le libellé du filtre par site. */
  readonly filterSite: string;
  readonly filterAllSites: string;
  /** Le filtre de jours, la sélection et le récapitulatif (lot R3). */
  readonly summary: OrderSummaryCopy;
  /** Modifier une commande passée (M3). */
  readonly revision: OrderReviseCopy;
  /** `{name}` est remplacé par « Prénom N. », l'auteur figé de la commande. */
  readonly authorCustomer: string;
  /** La commande a été saisie par l'équipe de la maison. */
  readonly authorTeam: string;
  readonly detailSite: string;
  /** `{n}` est remplacé par le nombre d'articles. */
  readonly pieces: string;
  /** Les deux modes, en toutes lettres. La commande porte un mot ANGLAIS. */
  readonly modePickup: string;
  readonly modeDelivery: string;
  /** Les quatre étapes du suivi. Seules la première et la dernière sont datées. */
  readonly stepPlaced: string;
  readonly stepBakery: string;
  readonly stepReady: string;
  readonly stepHandedPickup: string;
  readonly stepHandedDelivery: string;
  /** Affiché quand le jeton de remise EXISTE — jamais par principe. */
  readonly qrReady: string;
  /** Un client peut ne demander aucune tranche : c'est un choix, pas un trou. */
  readonly noWindow: string;
  /** « avant 6 h » — le mot devant une échéance (CA-D2). */
  readonly before: string;
  readonly statusCancelled: string;
  readonly emptyOrders: string;
  /**
   * **Reçue** — passée, mais le plan du soir ne l'a pas encore prise.
   *
   * 🔴 Ce libellé manquait, et le tableau annonçait « Prête » à sa place : le
   * repli couvrait TOUT ce qui n'était ni annulé, ni remis, ni en route. Un
   * client lisait donc « prête » sur une commande passée dix minutes plus tôt.
   * « Reçue » est devenu « Enregistrée » le 2026-10-21 (Hugo) : « reçue » n’était pas clair — on l’a, rien n’est encore lancé.
   */
  readonly statusReceived: string;
  /** **Au fournil** — le plan du soir l'a inscrite, la fabrication est lancée. */
  readonly statusBakery: string;
  readonly statusReady: string;
  readonly statusRoute: string;
  readonly statusDone: string;
  readonly statusDelivered: string;
  readonly payAccount: string;
  readonly payCard: string;
  /** Une commande carte passée, dont le paiement n'a pas encore abouti. */
  readonly payDue: string;
  /** Une commande carte passée, dont la banque a refusé le paiement. */
  readonly payRefused: string;
  /**
   * Le règlement dit aussi OÙ, et ce que la facture du mois porte : la TVA et
   * le TTC que la commande au compte ne chiffre plus (F5). Il disait « portée à
   * la facture de mars » — un mois écrit en dur, faux onze mois sur douze.
   */
  readonly payAccountNote: string;
  /** Après le montant d'une commande au compte : il est hors taxe (F5). */
  readonly totalPretax: string;
  readonly payCardNote: string;
  readonly payDueNote: string;
  readonly payRefusedNote: string;
  /** Le bouton qui rouvre l'écran de règlement de la MÊME commande. */
  readonly settle: string;
  /** L'intitulé de la ligne « Remboursement » — absente sans remboursement. */
  readonly detailRefund: string;
  /** L'intitulé de la remise de retrait quand une ligne en était exclue. */
  readonly detailPickupDiscount: string;
  /** `{value}` la remise, `{base}` son assiette mention comprise. */
  readonly detailPickupDiscountValue: string;
  /** L'intitulé des articles que la remise ne couvrait pas. */
  readonly detailPickupExcluded: string;
  /** Le cumul des remboursements réussis atteint le total. */
  readonly refundedFull: string;
  /** `{amount}` est remplacé par le cumul remboursé : « 12,50 € ». */
  readonly refundedPartial: string;
  readonly detailHead: string;
  readonly detailSlot: string;
  readonly detailPayment: string;
  readonly detailOrigin: string;
  /** Un gabarit de panier a produit la commande toute seule. */
  readonly originRecurring: string;
  /**
   * La maison a pris la commande POUR le client — c'est un acteur, pas un
   * canal, et le mot doit le dire.
   */
  readonly originPhone: string;
  readonly detailMode: string;
  readonly purchaseOrder: string;
  /**
   * Quand le document ne vient pas.
   *
   * Il **se dit**, plutôt que de laisser un bouton sans effet : un
   * téléchargement qui ne produit aucun fichier et aucun message ressemble à
   * un clic manqué, et on reclique.
   */
  readonly purchaseOrderFailed: string;
  /** Le bon de livraison chiffré d'une commande remise (plan E5a, § 3). */
  readonly deliveryNote: string;
  /** Quand il ne vient pas — même règle que le bon de commande. */
  readonly deliveryNoteFailed: string;
  readonly reorder: string;
  readonly problem: string;
  readonly expand: string;
  readonly collapse: string;
  readonly rateIdle: string;
  readonly rateHigh: string;
  readonly rateLow: string;
  /** `{n}` est remplacé par la note donnée, de 1 à 5. */
  readonly rateStar: string;
  readonly reportKicker: string;
  readonly reportTitle: string;
  readonly reportLead: string;
  readonly reasonHead: string;
  /** Le texte de la liste des motifs (réglés au back-office), avant le choix. */
  readonly reasonPlaceholder: string;
  readonly photoHead: string;
  readonly photoHint: string;
  /** `{n}` : combien de photos on peut encore ajouter. */
  readonly photoRemaining: string;
  /** `{name}` : la photo retirée. */
  readonly photoRemove: string;
  /** `{name}` : le fichier refusé avant l'envoi. */
  readonly photoBadType: string;
  readonly photoTooBig: string;
  /** `{n}` : la borne. */
  readonly photoTooMany: string;
  readonly reportCancel: string;
  readonly sending: string;
  /** L'annonce du succès, après quoi le dialogue se ferme. */
  readonly reportSent: string;
  /** Le repli d'un refus dont le serveur n'a pas dit la cause. */
  readonly reportRefused: string;
  readonly reasonsLoading: string;
  readonly reasonsFailed: string;
  readonly reasonsRetry: string;
  readonly noReasonTitle: string;
  readonly noReasonSubtitle: string;
  readonly wordHead: string;
  readonly wordPlaceholder: string;
  readonly send: string;
  readonly reportFoot: string;
}

export const ORDERS_FR: OrdersCopy = {
  title: 'Mes commandes',
  lead: 'Ce qui est en route, puis tout ce qui est passé — avec son état de règlement.',
  liveCount: '{n} suivis en cours',
  wellHead: 'Mes suivis',
  wellHint: '{n} en cours',
  wellDot: 'Aller au suivi {n}',
  wellAll: 'Toutes mes commandes',
  wellNone: 'Rien en cours',
  wellNoneHint: 'Vos commandes vivantes s’affichent ici, du panier à la remise.',
  progress: 'Avancement : {n} %',
  qr: 'Mon QR',
  qrLong: 'Mon QR de retrait',
  qrSend: 'Envoyer le QR',
  courierCall: 'Contacter',
  courierTrack: 'Suivre en direct',
  courierOnWay: '{name} est en route',
  courierPending: 'Coursier attribué au départ',
  historyHead: 'Commandes passées',
  historyNote: 'Un tableau, parce qu’ici on compare.',
  colOrder: 'Commande',
  colMode: 'Mode',
  colDate: 'Date',
  colStatus: 'Statut',
  colPayment: 'Règlement',
  colTotal: 'Total',
  colSite: 'Site',
  filterSite: 'Site',
  filterAllSites: 'Tous les sites',
  summary: ORDER_SUMMARY_FR,
  revision: ORDER_REVISE_FR,
  authorCustomer: 'passée par {name}',
  authorTeam: 'par l’équipe',
  detailSite: 'Site',
  pieces: '{n} art.',
  modePickup: 'Retrait',
  modeDelivery: 'Coursier',
  stepPlaced: 'Panier validé',
  stepBakery: 'Au fournil',
  stepReady: 'Prête',
  stepHandedPickup: 'Retirée',
  stepHandedDelivery: 'Livrée',
  qrReady: 'Votre QR est prêt — présentez-le au comptoir',
  noWindow: 'Aucune tranche demandée',
  before: 'avant',
  statusCancelled: 'Annulée',
  emptyOrders: 'Aucune commande pour l’instant.',
  statusReceived: 'Enregistrée',
  statusBakery: 'Au fournil',
  statusReady: 'Prête',
  statusRoute: 'En route',
  statusDone: 'Retirée',
  statusDelivered: 'Livrée',
  payAccount: 'Au compte',
  payCard: 'Réglée · CB',
  payDue: 'À régler',
  payRefused: 'Paiement refusé',
  payAccountNote: 'portée à la facture du mois, avec la TVA et le TTC',
  totalPretax: 'HT',
  payCardNote: 'réglée à la commande',
  payDueNote: 'le paiement par carte n’a pas abouti',
  payRefusedNote: 'votre banque a refusé la carte',
  settle: 'Régler',
  detailRefund: 'Remboursement',
  detailPickupDiscount: 'Remise retrait',
  detailPickupDiscountValue: '−{value} sur {base} éligibles',
  detailPickupExcluded: 'Non concernés par la remise retrait',
  refundedFull: 'Remboursée',
  refundedPartial: 'Remboursée en partie ({amount})',
  detailHead: 'Le détail',
  detailSlot: 'Créneau',
  detailPayment: 'Règlement',
  detailOrigin: 'Origine',
  originRecurring: 'Panier récurrent',
  originPhone: 'Prise par La Folie Coffee',
  detailMode: 'Mode',
  purchaseOrder: 'Confirmation de commande',
  purchaseOrderFailed:
    'La confirmation de commande n’a pas pu être téléchargée. Réessayez dans un instant.',
  deliveryNote: 'Bon de livraison',
  deliveryNoteFailed: 'Le bon de livraison n’a pas pu être téléchargé. Réessayez dans un instant.',
  reorder: 'Recommander à l’identique',
  problem: 'Un problème sur cette commande',
  expand: 'Déplier la commande',
  collapse: 'Replier la commande',
  rateIdle: 'Notez cette commande',
  rateHigh: 'Merci — c’est noté.',
  rateLow: 'Merci, on regarde ça.',
  rateStar: 'Mettre {n} sur 5',
  reportKicker: 'Commande',
  reportTitle: 'Signaler un problème',
  reportLead:
    'Dites-nous ce qui s’est passé. On répond dans la journée, et on remet la pièce sur la prochaine commande quand c’est de notre fait.',
  reasonHead: 'La raison',
  reasonPlaceholder: 'Choisir une raison',
  photoRemaining: 'Jusqu’à {n} photo(s) de plus — JPEG, PNG ou WebP, 5 Mo chacune.',
  photoRemove: 'Retirer {name}',
  photoBadType: '« {name} » n’est pas une photo JPEG, PNG ou WebP.',
  photoTooBig: '« {name} » dépasse 5 Mo.',
  photoTooMany: '{n} photos au plus.',
  reportCancel: 'Annuler',
  sending: 'Envoi…',
  reportSent: 'Signalement envoyé',
  reportRefused: 'Le signalement n’est pas parti. Réessayez dans un instant.',
  reasonsLoading: 'Chargement des raisons…',
  reasonsFailed: 'Les raisons n’ont pas pu être lues.',
  reasonsRetry: 'Réessayer',
  noReasonTitle: 'Aucune raison proposée',
  noReasonSubtitle: 'Appelez-nous ou écrivez-nous depuis l’accueil.',
  photoHead: 'Des photos, si vous en avez',
  photoHint: 'Prendre ou choisir une photo',
  wordHead: 'Un mot, si besoin',
  wordPlaceholder: 'Il manquait deux croissants dans le sachet…',
  send: 'Envoyer au Labo',
  reportFoot:
    'Camille et Malik reçoivent le message avec la commande, le mode et la photo — rien à réexpliquer.',
};

export const ORDERS_EN: OrdersCopy = {
  title: 'My orders',
  lead: 'What is on its way, then everything that is past — with how it was settled.',
  liveCount: '{n} orders in progress',
  wellHead: 'My tracking',
  wellHint: '{n} in progress',
  wellDot: 'Go to tracking {n}',
  wellAll: 'All my orders',
  wellNone: 'Nothing in progress',
  wellNoneHint: 'Live orders show up here, from basket to handover.',
  progress: 'Progress: {n}%',
  qr: 'My QR',
  qrLong: 'My pickup QR',
  qrSend: 'Send the QR',
  courierCall: 'Contact',
  courierTrack: 'Follow live',
  courierOnWay: '{name} is on the way',
  courierPending: 'Courier assigned on departure',
  historyHead: 'Past orders',
  historyNote: 'A table, because this is where you compare.',
  colOrder: 'Order',
  colMode: 'Mode',
  colDate: 'Date',
  colStatus: 'Status',
  colPayment: 'Settlement',
  colTotal: 'Total',
  colSite: 'Site',
  filterSite: 'Site',
  filterAllSites: 'All sites',
  summary: ORDER_SUMMARY_EN,
  revision: ORDER_REVISE_EN,
  authorCustomer: 'placed by {name}',
  authorTeam: 'by our team',
  detailSite: 'Site',
  pieces: '{n} items',
  modePickup: 'Collection',
  modeDelivery: 'Courier',
  stepPlaced: 'Basket confirmed',
  stepBakery: 'In the bakehouse',
  stepReady: 'Ready',
  stepHandedPickup: 'Collected',
  stepHandedDelivery: 'Delivered',
  qrReady: 'Your QR is ready — show it at the counter',
  noWindow: 'No time slot requested',
  before: 'before',
  statusCancelled: 'Cancelled',
  emptyOrders: 'No orders yet.',
  statusReceived: 'Registered',
  statusBakery: 'In the bakehouse',
  statusReady: 'Ready',
  statusRoute: 'On the way',
  statusDone: 'Collected',
  statusDelivered: 'Delivered',
  payAccount: 'On account',
  payCard: 'Paid · card',
  payDue: 'To pay',
  payRefused: 'Payment declined',
  payAccountNote: 'carried to the monthly invoice, with VAT and the total incl. VAT',
  totalPretax: 'excl. VAT',
  payCardNote: 'paid at checkout',
  payDueNote: 'the card payment did not go through',
  payRefusedNote: 'your bank declined the card',
  settle: 'Pay',
  detailRefund: 'Refund',
  detailPickupDiscount: 'Collection discount',
  detailPickupDiscountValue: '−{value} on {base} eligible',
  detailPickupExcluded: 'Not covered by the collection discount',
  refundedFull: 'Refunded',
  refundedPartial: 'Partly refunded ({amount})',
  detailHead: 'The detail',
  detailSlot: 'Slot',
  detailPayment: 'Settlement',
  detailOrigin: 'Origin',
  originRecurring: 'Recurring basket',
  originPhone: 'Taken by La Folie Coffee',
  detailMode: 'Mode',
  purchaseOrder: 'Order confirmation',
  purchaseOrderFailed:
    'The order confirmation could not be downloaded. Please try again in a moment.',
  deliveryNote: 'Delivery note',
  deliveryNoteFailed: 'The delivery note could not be downloaded. Please try again in a moment.',
  reorder: 'Order the same again',
  problem: 'A problem with this order',
  expand: 'Expand the order',
  collapse: 'Collapse the order',
  rateIdle: 'Rate this order',
  rateHigh: 'Thank you — noted.',
  rateLow: 'Thank you, we’ll look into it.',
  rateStar: 'Give {n} out of 5',
  reportKicker: 'Order',
  reportTitle: 'Report a problem',
  reportLead:
    'Tell us what happened. We answer the same day, and we put the item back on your next order when it is on us.',
  reasonHead: 'The reason',
  reasonPlaceholder: 'Choose a reason',
  photoRemaining: 'Up to {n} more photo(s) — JPEG, PNG or WebP, 5 MB each.',
  photoRemove: 'Remove {name}',
  photoBadType: '“{name}” is not a JPEG, PNG or WebP photo.',
  photoTooBig: '“{name}” is larger than 5 MB.',
  photoTooMany: '{n} photos at most.',
  reportCancel: 'Cancel',
  sending: 'Sending…',
  reportSent: 'Report sent',
  reportRefused: 'The report was not sent. Please try again in a moment.',
  reasonsLoading: 'Loading reasons…',
  reasonsFailed: 'The reasons could not be loaded.',
  reasonsRetry: 'Try again',
  noReasonTitle: 'No reason available',
  noReasonSubtitle: 'Call us or write to us from the home page.',
  photoHead: 'Photos, if you have any',
  photoHint: 'Take or choose a photo',
  wordHead: 'A word, if needed',
  wordPlaceholder: 'Two croissants were missing from the bag…',
  send: 'Send to Le Labo',
  reportFoot:
    'Camille and Malik get the message with the order, the mode and the photo — nothing to explain twice.',
};

export const ORDERS_IT: OrdersCopy = {
  title: 'I miei ordini',
  lead: 'Quello che è in arrivo, poi tutto quello che è passato — con il suo stato di pagamento.',
  liveCount: '{n} ordini in corso',
  wellHead: 'I miei tracciamenti',
  wellHint: '{n} in corso',
  wellDot: 'Andare al tracciamento {n}',
  wellAll: 'Tutti i miei ordini',
  wellNone: 'Niente in corso',
  wellNoneHint: 'Gli ordini in corso compaiono qui, dal carrello alla consegna.',
  progress: 'Avanzamento: {n} %',
  qr: 'Il mio QR',
  qrLong: 'Il mio QR di ritiro',
  qrSend: 'Inviare il QR',
  courierCall: 'Contattare',
  courierTrack: 'Seguire in diretta',
  courierOnWay: '{name} è in arrivo',
  courierPending: 'Corriere assegnato alla partenza',
  historyHead: 'Ordini passati',
  historyNote: 'Una tabella, perché qui si confronta.',
  colOrder: 'Ordine',
  colMode: 'Modalità',
  colDate: 'Data',
  colStatus: 'Stato',
  colPayment: 'Pagamento',
  colTotal: 'Totale',
  colSite: 'Sede',
  filterSite: 'Sede',
  filterAllSites: 'Tutte le sedi',
  summary: ORDER_SUMMARY_IT,
  revision: ORDER_REVISE_IT,
  authorCustomer: 'effettuato da {name}',
  authorTeam: 'dal nostro team',
  detailSite: 'Sede',
  pieces: '{n} art.',
  modePickup: 'Ritiro',
  modeDelivery: 'Corriere',
  stepPlaced: 'Carrello confermato',
  stepBakery: 'In forno',
  stepReady: 'Pronta',
  stepHandedPickup: 'Ritirata',
  stepHandedDelivery: 'Consegnata',
  qrReady: 'Il suo QR è pronto — lo mostri al banco',
  noWindow: 'Nessuna fascia richiesta',
  before: 'entro le',
  statusCancelled: 'Annullata',
  emptyOrders: 'Nessun ordine per ora.',
  statusReceived: 'Registrata',
  statusBakery: 'In forno',
  statusReady: 'Pronto',
  statusRoute: 'In viaggio',
  statusDone: 'Ritirato',
  statusDelivered: 'Consegnato',
  payAccount: 'Sul conto',
  payCard: 'Pagato · carta',
  payDue: 'Da pagare',
  payRefused: 'Pagamento rifiutato',
  payAccountNote: 'riportato sulla fattura del mese, con IVA e totale IVA inclusa',
  totalPretax: 'IVA escl.',
  payCardNote: 'pagato all’ordine',
  payDueNote: 'il pagamento con carta non è andato a buon fine',
  payRefusedNote: 'la tua banca ha rifiutato la carta',
  settle: 'Paga',
  detailRefund: 'Rimborso',
  detailPickupDiscount: 'Sconto ritiro',
  detailPickupDiscountValue: '−{value} su {base} idonei',
  detailPickupExcluded: 'Non coperti dallo sconto ritiro',
  refundedFull: 'Rimborsato',
  refundedPartial: 'Rimborsato in parte ({amount})',
  detailHead: 'Il dettaglio',
  detailSlot: 'Fascia oraria',
  detailPayment: 'Pagamento',
  detailOrigin: 'Origine',
  originRecurring: 'Carrello ricorrente',
  originPhone: 'Presa da La Folie Coffee',
  detailMode: 'Modalità',
  purchaseOrder: 'Conferma d’ordine',
  purchaseOrderFailed:
    'Non è stato possibile scaricare la conferma d’ordine. Riprova tra un istante.',
  deliveryNote: 'Documento di trasporto',
  deliveryNoteFailed:
    'Non è stato possibile scaricare il documento di trasporto. Riprova tra un istante.',
  reorder: 'Riordinare identico',
  problem: 'Un problema su questo ordine',
  expand: 'Aprire l’ordine',
  collapse: 'Chiudere l’ordine',
  rateIdle: 'Valuta questo ordine',
  rateHigh: 'Grazie — preso nota.',
  rateLow: 'Grazie, ci guardiamo.',
  rateStar: 'Dare {n} su 5',
  reportKicker: 'Ordine',
  reportTitle: 'Segnalare un problema',
  reportLead:
    'Diteci che cosa è successo. Rispondiamo in giornata e rimettiamo il pezzo sul prossimo ordine quando dipende da noi.',
  reasonHead: 'Il motivo',
  reasonPlaceholder: 'Scegliere un motivo',
  photoRemaining: 'Fino a {n} foto in più — JPEG, PNG o WebP, 5 MB ciascuna.',
  photoRemove: 'Togliere {name}',
  photoBadType: '«{name}» non è una foto JPEG, PNG o WebP.',
  photoTooBig: '«{name}» supera 5 MB.',
  photoTooMany: '{n} foto al massimo.',
  reportCancel: 'Annulla',
  sending: 'Invio…',
  reportSent: 'Segnalazione inviata',
  reportRefused: 'La segnalazione non è partita. Riprovate tra un istante.',
  reasonsLoading: 'Caricamento dei motivi…',
  reasonsFailed: 'Non è stato possibile leggere i motivi.',
  reasonsRetry: 'Riprova',
  noReasonTitle: 'Nessun motivo proposto',
  noReasonSubtitle: 'Chiamateci o scriveteci dalla pagina iniziale.',
  photoHead: 'Delle foto, se le avete',
  photoHint: 'Scattare o scegliere una foto',
  wordHead: 'Due parole, se serve',
  wordPlaceholder: 'Mancavano due croissant nel sacchetto…',
  send: 'Inviare al Labo',
  reportFoot:
    'Camille e Malik ricevono il messaggio con l’ordine, la modalità e la foto — niente da rispiegare.',
};
