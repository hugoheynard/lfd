import type { FulfillmentWindow, CustomerOrderView } from '@lfd/contracts';

/**
 * **Ce que l'écran des commandes lit** — les modèles de vue, et leur fabrication
 * depuis `CustomerOrderView`.
 *
 * 🔴 Ils venaient d'un fichier de maquette : deux suivis et six lignes
 * d'historique écrits en dur, avec leurs références, leurs montants et leurs
 * horaires. L'écran montrait donc les commandes de personne.
 *
 * ## Les horodatages d'étape, depuis le 2026-09-07
 *
 * ⚠️ **Ce paragraphe disait le contraire jusqu'à cette date**, et il faut le
 * citer plutôt que le faire disparaître :
 *
 * > « Le modèle porte des statuts, pas l'heure de chacun : rien ne dit à quelle
 * > heure une commande est entrée au fournil. »
 *
 * C'était **vrai** quand ça a été écrit : seules la passation et la remise
 * étaient datées, et l'écran affichait donc deux étapes sur quatre sans heure
 * — honnêtement, parce qu'une heure plausible aurait été une heure fausse.
 *
 * Le contexte `production` a produit les deux qui manquaient, et ce sont de
 * vrais instants constatés, pas des dérivations : `confirmedAt` est l'heure de
 * la **clôture du plan du soir**, `readyAt` celle du **colisage** au fournil.
 * Les deux arrivent au commerce par événement. Les quatre étapes sont donc
 * datées, et aucune ne l'est par supposition.
 *
 * ## Ce qui n'a toujours PAS de source
 *
 * - **Le coursier.** Ni son prénom ni son téléphone n'existent : la tournée de
 *   livraison n'est pas construite.
 * - **QUI a commandé.** `CustomerOrderView` porte l'auteur STAFF d'une saisie, jamais
 *   l'acheteur. La colonne est partie plutôt que de répéter le nom du compte à
 *   chaque ligne.
 *
 * La barre d'avancement, elle, reste : elle ne dit rien de plus que le statut,
 * elle le DESSINE. C'est une présentation, pas une affirmation.
 */

/** Une étape franchie, ou à franchir. */
export interface TrackStep {
  /** Le MÉTIER, jamais le logiciel : « au fournil », pas « PROCESSING ». */
  readonly label: string;
  /**
   * L'heure réelle, ou **vide** tant que l'étape n'a pas été franchie.
   *
   * Les quatre sont datables depuis le 2026-09-07. Une étape à venir reste sans
   * heure — c'est le seul cas de vide qui subsiste, et il dit quelque chose.
   */
  readonly at: string;
}

/** Le mode de service décide de la couleur de l'en-tête ET du pied de carte. */
export type TrackMode = 'pickup' | 'courier';

/** Une commande VIVANTE, celle qu'on suit. */
export interface TrackedOrder {
  /** L'identifiant SERVEUR — ce que l'écran du QR ouvrira. */
  readonly id: string;
  readonly reference: string;
  readonly mode: TrackMode;
  /** Le lieu ou l'adresse, tel qu'il s'écrit — « Retrait · Le Labo ». */
  readonly kind: string;
  readonly title: string;
  readonly sub: string;
  readonly total: number;
  readonly pieces: number;
  /** L'avancement, de 0 à 100 — le statut, dessiné. */
  readonly percent: number;
  readonly steps: readonly TrackStep[];
  /** L'étape en cours, en partant de zéro. Avant elle, c'est fait. */
  readonly at: number;
  /** Retrait : le point choisi. Coursier : vide. */
  readonly pickup: string;
  readonly pickupNote: string;
}

/**
 * L'état d'une commande, réduit à ce que l'écran distingue.
 *
 * 🔴 **Il en manquait deux, et le repli mentait.** `statusOf` rendait `ready`
 * pour tout ce qui n'était ni annulé, ni remis, ni en route : une commande
 * passée il y a dix minutes s'affichait donc « Prête » dans le tableau. Le
 * client lisait que son pain l'attendait alors que la nuit de fabrication
 * n'avait pas commencé.
 *
 * Ce n'était pas faux quand ça a été écrit — rien ne faisait avancer une
 * commande au-delà de `placed`, donc « prête » et « passée » se confondaient en
 * pratique. Le fournil a séparé les deux : la clôture du plan pose `confirmed`,
 * le colisage pose `ready`, et ces deux mots-là veulent maintenant dire quelque
 * chose de différent au client.
 *
 * Le client ne suit toujours pas une machine à états : `draft` n'atteint jamais
 * cet écran, et `in_production` garde son « en route » d'origine.
 */
export type OrderRowStatus =
  'received' | 'bakery' | 'ready' | 'route' | 'done' | 'delivered' | 'cancelled';

/** D'où la commande est entrée, quand ce n'est PAS l'app. */
export type OrderOrigin = '' | 'recurring' | 'phone';

/**
 * Comment la commande est réglée — et il n'y a QUE ces deux-là.
 *
 * Une commande n'attend jamais son règlement : ou elle part au compte, et c'est
 * la facture du mois qui la porte, ou elle a été payée par carte au moment où
 * elle a été passée. Un troisième état « à régler » décrirait une commande
 * livrée que personne n'a payée — ça n'existe pas dans ce commerce.
 */
export type OrderPayment = 'account' | 'card';

/** Une commande PASSÉE, telle que le tableau la compare. */
export interface HistoryOrder {
  /**
   * L'identifiant SERVEUR — celui que les routes attendent.
   *
   * La `reference` est ce qu'on MONTRE ; elle ne nomme rien pour l'API. Sans
   * lui, le bouton du bon de commande n'avait rien à demander.
   */
  readonly id: string;
  readonly reference: string;
  readonly date: string;
  readonly mode: string;
  readonly slot: string;
  readonly pieces: number;
  readonly total: number;
  readonly status: OrderRowStatus;
  readonly payment: OrderPayment;
  readonly origin: OrderOrigin;
  /** La maison de l'espace courant — elle situe la personne, pas la ligne. */
  readonly org: string;
}

/** Ce que les libellés du domaine ne portent pas : les mots de l'écran. */
export interface RowCopy {
  readonly pickup: string;
  readonly delivery: string;
  readonly stepPlaced: string;
  readonly stepBakery: string;
  readonly stepReady: string;
  readonly stepHandedPickup: string;
  readonly stepHandedDelivery: string;
  readonly qrReady: string;
  readonly noWindow: string;
}

/**
 * Les quatre étapes, dans l'ordre où le pain les franchit.
 *
 * 🔴 **`ready` y manquait**, et le défaut se voyait à l'écran : une commande
 * dont le bac était fait retombait sur le `?? 0` de l'appelant, donc s'affichait
 * à « commande passée ». Le client voyait sa commande reculer de deux crans au
 * moment précis où elle avançait le plus.
 *
 * La table est désormais **exhaustive sur les statuts que cet écran voit** :
 * `draft` ne l'atteint jamais et `cancelled` a son propre traitement. Le repli
 * de l'appelant ne couvre donc plus rien de réel — il reste comme filet pour un
 * statut ajouté demain, pas comme mécanisme.
 */
const STEP_OF_STATUS: Readonly<Record<string, number>> = {
  placed: 0,
  confirmed: 1,
  in_production: 1,
  ready: 2,
  fulfilled: 3,
};

/** Une commande est-elle encore VIVANTE ? Le suivi ne montre que celles-là. */
export function isLive(order: CustomerOrderView): boolean {
  return order.status !== 'fulfilled' && order.status !== 'cancelled';
}

/** Le suivi d'une commande en cours. */
export function trackedOf(order: CustomerOrderView, copy: RowCopy): TrackedOrder {
  const at = STEP_OF_STATUS[order.status] ?? 0;
  const place = placeOf(order);
  return {
    id: order.id,
    reference: order.orderNumber,
    mode: order.fulfillmentMethod === 'pickup' ? 'pickup' : 'courier',
    kind: `${modeLabel(order, copy)} · ${place}`,
    title: order.requestedDeliveryDate ?? '',
    sub: windowOf(order) || copy.noWindow,
    total: order.totalCents / 100,
    pieces: piecesOf(order),
    // Le statut, DESSINÉ : quatre étapes, donc un quart par étape franchie.
    percent: Math.round(((at + 1) / 4) * 100),
    steps: stepsOf(order, copy),
    at,
    pickup: order.fulfillmentMethod === 'pickup' ? place : '',
    // Le QR n'est « prêt » que si le jeton existe VRAIMENT — il n'est émis que
    // pour les commandes en retrait.
    pickupNote: order.handoverToken === null ? '' : copy.qrReady,
  };
}

/** Une ligne d'historique. */
export function historyRowOf(order: CustomerOrderView, org: string, copy: RowCopy): HistoryOrder {
  return {
    id: order.id,
    reference: order.orderNumber,
    date: order.requestedDeliveryDate ?? order.placedAt.slice(0, 10),
    mode: modeLabel(order, copy),
    slot: windowOf(order),
    pieces: piecesOf(order),
    total: order.totalCents / 100,
    status: statusOf(order),
    // `not_required` = portée au compte, facturée en fin de mois. Tout le reste
    // est passé par la carte au moment de commander.
    payment: order.paymentStatus === 'not_required' ? 'account' : 'card',
    origin: originOf(order),
    org,
  };
}

/**
 * Les quatre étapes, **toutes datées par un fait constaté**.
 *
 * Chacune tire son heure de l'instant que le contexte responsable a gravé, et
 * d'aucune autre source : la passation du commerce, la clôture du plan et le
 * colisage du fournil, la remise au comptoir. Aucune n'est déduite d'une autre,
 * donc aucune ne peut mentir sur l'ordre — si le fournil n'a rien constaté,
 * l'étape reste vide plutôt que d'emprunter l'heure de sa voisine.
 */
function stepsOf(order: CustomerOrderView, copy: RowCopy): readonly TrackStep[] {
  const handed =
    order.fulfillmentMethod === 'pickup' ? copy.stepHandedPickup : copy.stepHandedDelivery;
  return [
    { label: copy.stepPlaced, at: hour(order.placedAt) },
    { label: copy.stepBakery, at: hourOrNothing(order.confirmedAt) },
    { label: copy.stepReady, at: hourOrNothing(order.readyAt) },
    { label: handed, at: hourOrNothing(order.handedOverAt) },
  ];
}

/**
 * Le statut du domaine, traduit en ce que le client comprend.
 *
 * ⚠️ **Aucun repli implicite.** Chaque statut que cet écran peut voir a sa
 * branche ; ce qui reste — `draft`, qui n'arrive jamais jusqu'ici — retombe sur
 * « reçue », l'affirmation la plus faible. Un repli sur « prête » était le
 * défaut d'origine : le mot le plus engageant était celui qu'on disait quand on
 * ne savait pas.
 */
function statusOf(order: CustomerOrderView): OrderRowStatus {
  if (order.status === 'cancelled') {
    return 'cancelled';
  }
  if (order.status === 'fulfilled') {
    return order.fulfillmentMethod === 'pickup' ? 'done' : 'delivered';
  }
  if (order.status === 'in_production') {
    return 'route';
  }
  if (order.status === 'ready') {
    return 'ready';
  }
  return order.status === 'confirmed' ? 'bakery' : 'received';
}

function originOf(order: CustomerOrderView): OrderOrigin {
  if (order.origin === 'recurring') {
    return 'recurring';
  }
  return order.origin === 'back_office' ? 'phone' : '';
}

/** Le nombre de pièces : la somme des quantités, pas le nombre de lignes. */
function piecesOf(order: CustomerOrderView): number {
  return order.lines.reduce((total, line) => total + line.quantity, 0);
}

function modeLabel(order: CustomerOrderView, copy: RowCopy): string {
  return order.fulfillmentMethod === 'pickup' ? copy.pickup : copy.delivery;
}

/** Le lieu figé sur la commande — jamais le réglage d'aujourd'hui. */
/**
 * Le lieu, tel que la commande l'a FIGÉ — le point de retrait, ou la ville
 * livrée. Exporté pour la même raison que `windowOf` : l'accueil et le suivi
 * nomment le même endroit, et deux dérivations finiraient par diverger.
 */
export function placeOf(order: CustomerOrderView): string {
  const snapshot =
    order.fulfillmentMethod === 'pickup' ? order.pickupAddress : order.deliveryAddress;
  if (snapshot === null) {
    return '';
  }
  return snapshot.label.trim() === '' ? snapshot.ville : snapshot.label;
}

/**
 * La tranche demandée, ou vide — un client peut n'en vouloir aucune.
 *
 * Exportée : l'accueil connecté annonce la même tranche que le suivi, et deux
 * façons de la mettre en forme finiraient par se contredire sur l'écran qui la
 * lit le moins.
 */
export function windowOf(order: CustomerOrderView): string {
  const window: FulfillmentWindow | null = order.fulfillment.window.value;
  if (window === null) {
    return '';
  }
  return window.start === null ? window.end : `${window.start} – ${window.end}`;
}

/** L'heure d'un instant qui peut ne pas exister — l'étape est alors à venir. */
function hourOrNothing(iso: string | null): string {
  return iso === null ? '' : hour(iso);
}

/** `HH:MM` d'un instant ISO, dans le fuseau du lecteur. */
function hour(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
