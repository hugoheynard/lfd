/**
 * Les commandes de la maquette — suivis en cours et historique.
 *
 * ⚠️ SIMULATION. `09-mes-commandes.md` liste ce qui manque au modèle réel pour
 * que cet écran vive : des HORODATAGES D'ÉTAPE (le back-office a les statuts,
 * pas l'heure de chacun), un bon de commande PDF, et un canal de réclamation
 * attaché à la commande. Tant qu'ils n'existent pas, l'écran se nourrit d'ici —
 * un seul endroit à débrancher, comme [[mock-client]].
 *
 * Les chiffres et les références sont ceux du prototype, repris tels quels :
 * une maquette qui invente ses propres montants ne se compare plus à la réf.
 */

/**
 * Une étape franchie, ou à franchir.
 *
 * Deux lignes et pas trois : la phrase d'ambiance (« pétrissage puis
 * façonnage ») a été retirée. Répétée sous chacune des quatre étapes de
 * chacune des trois cartes, elle faisait douze lignes de commentaire pour zéro
 * information — l'étape et son heure disent déjà tout ce qu'on vient chercher.
 */
export interface TrackStep {
  /** Le MÉTIER, jamais le logiciel : « au fournil », pas « PROCESSING ». */
  readonly label: string;
  /** L'heure réelle, ou la fenêtre à venir. */
  readonly at: string;
}

/** Le mode de service décide de la couleur de l'en-tête ET du pied de carte. */
export type TrackMode = 'pickup' | 'courier';

/** Une commande VIVANTE, celle qu'on suit. */
export interface TrackedOrder {
  readonly reference: string;
  readonly mode: TrackMode;
  /** Le lieu ou l'adresse, tel qu'il s'écrit — « Retrait · Le Labo ». */
  readonly kind: string;
  readonly title: string;
  readonly sub: string;
  readonly total: number;
  readonly pieces: number;
  /** L'avancement, de 0 à 100 — la barre le redit sans les mots. */
  readonly percent: number;
  readonly steps: readonly TrackStep[];
  /** L'étape en cours, en partant de zéro. Avant elle, c'est fait. */
  readonly at: number;
  /** Retrait : le point choisi. Coursier : vide. */
  readonly pickup: string;
  readonly pickupNote: string;
  /** Coursier : son prénom, ou `null` tant qu'il n'est pas attribué. */
  readonly courier: string | null;
  readonly courierNote: string;
}

export type OrderStatus = 'ready' | 'route' | 'done' | 'delivered';
export type OrderOrigin = '' | 'recurring' | 'phone';
/**
 * Comment la commande est réglée — et il n'y a QUE ces deux-là.
 *
 * Une commande n'attend jamais son règlement : ou elle part au compte, et c'est
 * la facture du mois qui la porte, ou elle a été payée par carte au moment où
 * elle a été passée. Un troisième état « à régler » décrirait une commande
 * livrée que personne n'a payée — ça n'existe pas dans ce commerce. Ce qui
 * attend un règlement, c'est une FACTURE, et ça se lit dans `mes-factures`.
 */
export type OrderPayment = 'account' | 'card';

/** Une commande PASSÉE, telle que le tableau la compare. */
export interface HistoryOrder {
  readonly reference: string;
  readonly date: string;
  readonly mode: string;
  readonly slot: string;
  readonly pieces: number;
  readonly total: number;
  readonly status: OrderStatus;
  readonly payment: OrderPayment;
  /**
   * D'où elle vient quand ce n'est PAS l'app.
   *
   * `phone` ne dit pas un canal, il dit un ACTEUR : la commande a été prise par
   * La Folie Coffee pour le client, et non passée par lui. C'est la seule ligne
   * du tableau que le client n'a pas saisie lui-même, et la taire ferait croire
   * à une commande oubliée.
   *
   * Vide pour l'app : la pastille ne dit que l'exception.
   */
  readonly origin: OrderOrigin;
  /** La maison de l'espace courant. Le tableau est MONO-COMPTE — on change
   *  d'espace pour voir les commandes d'une autre maison — donc elle ne
   *  distingue pas les lignes entre elles : elle situe la personne. */
  readonly org: string;
  /** Qui a commandé. C'est LUI qu'on cherche dans une colonne, pas la maison. */
  readonly who: string;
}

const PICKUP_STEPS: readonly TrackStep[] = [
  { label: 'Panier validé', at: 'hier · 18 h 42' },
  { label: 'Au fournil', at: 'aujourd’hui · 4 h 15' },
  { label: 'Prête', at: 'aujourd’hui · 6 h 58' },
  { label: 'Retirée', at: 'à venir · 7 h – 8 h' },
];

export const MOCK_TRACKED: readonly TrackedOrder[] = [
  {
    reference: '#4821',
    mode: 'pickup',
    kind: 'Retrait · Le Labo',
    title: 'Prête depuis 6 h 58',
    sub: 'Retrait entre 7 h et 8 h · gardée au frais',
    total: 96.4,
    pieces: 7,
    percent: 66,
    steps: PICKUP_STEPS,
    at: 2,
    pickup: 'Le Labo · route de la Balme',
    pickupNote: 'Votre QR est prêt — présentez-le au comptoir',
    courier: null,
    courierNote: '',
  },
  {
    reference: '#4830',
    mode: 'courier',
    kind: 'Coursier · Le chalet',
    title: 'Malik arrive dans 8 min',
    sub: 'Parti du Labo à 7 h 04 · zone 1, Val d’Isère',
    total: 38.2,
    pieces: 4,
    percent: 82,
    steps: [
      { label: 'Panier validé', at: 'hier · 19 h 10' },
      { label: 'Au fournil', at: 'aujourd’hui · 4 h 40' },
      { label: 'En route', at: 'aujourd’hui · 7 h 04' },
      { label: 'Livrée', at: 'à venir · ~7 h 40' },
    ],
    at: 2,
    pickup: '',
    pickupNote: '',
    courier: 'Malik',
    courierNote: 'Coursier vélo · 06 74 21 90 33',
  },
  {
    reference: '#4834',
    mode: 'courier',
    kind: 'Coursier · Bureau',
    title: 'Au fournil depuis 4 h 40',
    sub: 'Départ du Labo vers 7 h 20 · zone 1, Val d’Isère',
    total: 54.6,
    pieces: 6,
    percent: 34,
    steps: [
      { label: 'Panier validé', at: 'hier · 20 h 05' },
      { label: 'Au fournil', at: 'aujourd’hui · 4 h 40' },
      { label: 'En route', at: 'à venir · ~7 h 20' },
      { label: 'Livrée', at: 'à venir · ~7 h 55' },
    ],
    at: 1,
    pickup: '',
    pickupNote: '',
    courier: null,
    courierNote: 'Attribué au départ du Labo',
  },
];

export const MOCK_HISTORY: readonly HistoryOrder[] = [
  {
    reference: '#4821',
    date: 'aujourd’hui · 6 h 58',
    mode: 'Retrait · Le Labo',
    slot: '7 h – 8 h',
    pieces: 7,
    total: 96.4,
    status: 'ready',
    payment: 'account',
    origin: '',
    org: 'Brasserie Marchand',
    who: 'Pierre Marchand',
  },
  {
    reference: '#4830',
    date: 'aujourd’hui · 7 h 04',
    mode: 'Coursier · Le chalet',
    slot: 'livraison ~7 h 40',
    pieces: 4,
    total: 38.2,
    status: 'route',
    payment: 'account',
    origin: '',
    org: 'Brasserie Marchand',
    who: 'Hélène Marchand',
  },
  {
    reference: '#4834',
    date: 'aujourd’hui · 7 h 20',
    mode: 'Coursier · Bureau',
    slot: 'livraison ~7 h 55',
    pieces: 6,
    total: 54.6,
    status: 'route',
    payment: 'account',
    origin: '',
    org: 'Refuge de la Balme',
    who: 'Pierre Marchand',
  },
  {
    reference: '#4818',
    date: '16 mars · 7 h 12',
    mode: 'Coursier · Le chalet',
    slot: 'livré à 7 h 12',
    pieces: 3,
    total: 22.4,
    status: 'delivered',
    payment: 'card',
    origin: '',
    org: 'Brasserie Marchand',
    who: 'Karim Bel',
  },
  {
    reference: '#4808',
    date: '11 mars · 7 h 20',
    mode: 'Retrait · Le Labo',
    slot: 'retiré à 7 h 20',
    pieces: 6,
    total: 84.2,
    status: 'done',
    payment: 'account',
    origin: 'recurring',
    org: 'Brasserie Marchand',
    who: 'Hélène Marchand',
  },
  {
    reference: '#4802',
    date: '7 mars · 9 h 05',
    mode: 'Retrait · Le Village',
    slot: 'retiré à 9 h 05',
    pieces: 2,
    total: 12.4,
    status: 'done',
    payment: 'card',
    origin: '',
    org: 'Brasserie Marchand',
    who: 'Pierre Marchand',
  },
  {
    reference: '#4796',
    date: '4 mars · 7 h 40',
    mode: 'Coursier · Bureau',
    slot: 'livré à 7 h 40',
    pieces: 5,
    total: 68.0,
    status: 'delivered',
    payment: 'account',
    origin: 'phone',
    org: 'Refuge de la Balme',
    who: 'Karim Bel',
  },
];
