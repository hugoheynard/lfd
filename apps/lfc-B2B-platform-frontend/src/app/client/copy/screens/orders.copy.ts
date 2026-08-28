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
  readonly colBy: string;
  readonly colMode: string;
  readonly colDate: string;
  readonly colStatus: string;
  readonly colPayment: string;
  readonly colTotal: string;
  /** `{n}` est remplacé par le nombre d'articles. */
  readonly pieces: string;
  readonly statusReady: string;
  readonly statusRoute: string;
  readonly statusDone: string;
  readonly statusDelivered: string;
  readonly payAccount: string;
  readonly payCard: string;
  readonly payDue: string;
  /** Le règlement dit aussi OÙ : « portée à la facture de mars ». */
  readonly payAccountNote: string;
  readonly payCardNote: string;
  readonly payDueNote: string;
  readonly detailSlot: string;
  readonly detailPayment: string;
  readonly detailOrigin: string;
  readonly detailMode: string;
  readonly purchaseOrder: string;
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
  /** Les cinq raisons, écrites comme on les entend au comptoir. */
  readonly reasons: readonly [string, string, string, string, string];
  readonly photoHead: string;
  readonly photoHint: string;
  readonly wordHead: string;
  readonly wordPlaceholder: string;
  readonly send: string;
  readonly reportFoot: string;
  readonly tileAccount: string;
  readonly tileCard: string;
}

export const ORDERS_FR: OrdersCopy = {
  title: 'Mes commandes',
  lead: 'Ce qui est en route, puis tout ce qui est passé — avec son état de règlement.',
  liveCount: '{n} suivis en cours',
  wellHead: 'Mes suivis',
  wellHint: '{n} en cours',
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
  colBy: 'Passée par',
  colMode: 'Mode',
  colDate: 'Date',
  colStatus: 'Statut',
  colPayment: 'Règlement',
  colTotal: 'Total',
  pieces: '{n} art.',
  statusReady: 'Prête',
  statusRoute: 'En route',
  statusDone: 'Retirée',
  statusDelivered: 'Livrée',
  payAccount: 'Au compte',
  payCard: 'Réglée · CB',
  payDue: 'À régler',
  payAccountNote: 'portée à la facture de mars',
  payCardNote: 'réglée à la commande',
  payDueNote: 'sur la facture FA‑2026‑0212',
  detailSlot: 'Créneau',
  detailPayment: 'Règlement',
  detailOrigin: 'Origine',
  detailMode: 'Mode',
  purchaseOrder: 'Bon de commande',
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
  reasons: [
    'Un article manquait',
    'Un article était abîmé',
    'Ce n’est pas ce que j’avais commandé',
    'Trop tard / trop tôt',
    'Autre',
  ],
  photoHead: 'Une photo, si vous en avez',
  photoHint: 'Ajouter une photo',
  wordHead: 'Un mot, si besoin',
  wordPlaceholder: 'Il manquait deux croissants dans le sachet…',
  send: 'Envoyer au Labo',
  reportFoot:
    'Camille et Malik reçoivent le message avec la commande, le mode et la photo — rien à réexpliquer.',
  tileAccount: 'Période en cours',
  tileCard: 'Réglé à la commande',
};

export const ORDERS_EN: OrdersCopy = {
  title: 'My orders',
  lead: 'What is on its way, then everything that is past — with how it was settled.',
  liveCount: '{n} orders in progress',
  wellHead: 'My tracking',
  wellHint: '{n} in progress',
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
  colBy: 'Placed by',
  colMode: 'Mode',
  colDate: 'Date',
  colStatus: 'Status',
  colPayment: 'Settlement',
  colTotal: 'Total',
  pieces: '{n} items',
  statusReady: 'Ready',
  statusRoute: 'On the way',
  statusDone: 'Collected',
  statusDelivered: 'Delivered',
  payAccount: 'On account',
  payCard: 'Paid · card',
  payDue: 'To settle',
  payAccountNote: 'carried to the March invoice',
  payCardNote: 'paid at checkout',
  payDueNote: 'on invoice FA‑2026‑0212',
  detailSlot: 'Slot',
  detailPayment: 'Settlement',
  detailOrigin: 'Origin',
  detailMode: 'Mode',
  purchaseOrder: 'Order form',
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
  reasons: [
    'An item was missing',
    'An item was damaged',
    'This is not what I ordered',
    'Too late / too early',
    'Something else',
  ],
  photoHead: 'A photo, if you have one',
  photoHint: 'Add a photo',
  wordHead: 'A word, if needed',
  wordPlaceholder: 'Two croissants were missing from the bag…',
  send: 'Send to Le Labo',
  reportFoot:
    'Camille and Malik get the message with the order, the mode and the photo — nothing to explain twice.',
  tileAccount: 'Current period',
  tileCard: 'Paid at checkout',
};

export const ORDERS_IT: OrdersCopy = {
  title: 'I miei ordini',
  lead: 'Quello che è in arrivo, poi tutto quello che è passato — con il suo stato di pagamento.',
  liveCount: '{n} ordini in corso',
  wellHead: 'I miei tracciamenti',
  wellHint: '{n} in corso',
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
  colBy: 'Effettuato da',
  colMode: 'Modalità',
  colDate: 'Data',
  colStatus: 'Stato',
  colPayment: 'Pagamento',
  colTotal: 'Totale',
  pieces: '{n} art.',
  statusReady: 'Pronto',
  statusRoute: 'In viaggio',
  statusDone: 'Ritirato',
  statusDelivered: 'Consegnato',
  payAccount: 'Sul conto',
  payCard: 'Pagato · carta',
  payDue: 'Da saldare',
  payAccountNote: 'riportato sulla fattura di marzo',
  payCardNote: 'pagato all’ordine',
  payDueNote: 'sulla fattura FA‑2026‑0212',
  detailSlot: 'Fascia oraria',
  detailPayment: 'Pagamento',
  detailOrigin: 'Origine',
  detailMode: 'Modalità',
  purchaseOrder: 'Buono d’ordine',
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
  reasons: [
    'Mancava un articolo',
    'Un articolo era rovinato',
    'Non è quello che avevo ordinato',
    'Troppo tardi / troppo presto',
    'Altro',
  ],
  photoHead: 'Una foto, se l’avete',
  photoHint: 'Aggiungere una foto',
  wordHead: 'Due parole, se serve',
  wordPlaceholder: 'Mancavano due croissant nel sacchetto…',
  send: 'Inviare al Labo',
  reportFoot:
    'Camille e Malik ricevono il messaggio con l’ordine, la modalità e la foto — niente da rispiegare.',
  tileAccount: 'Periodo in corso',
  tileCard: 'Pagato all’ordine',
};
