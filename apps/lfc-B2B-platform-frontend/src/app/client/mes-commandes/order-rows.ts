import type { FulfillmentWindow, OrderView } from '@lfd/contracts';

/**
 * **Ce que l'écran des commandes lit** — les modèles de vue, et leur fabrication
 * depuis `OrderView`.
 *
 * 🔴 Ils venaient d'un fichier de maquette : deux suivis et six lignes
 * d'historique écrits en dur, avec leurs références, leurs montants et leurs
 * horaires. L'écran montrait donc les commandes de personne.
 *
 * ## Ce qui n'a PAS de source, et qui a disparu
 *
 * - **Les horodatages d'étape.** Le modèle porte des statuts, pas l'heure de
 *   chacun : rien ne dit à quelle heure une commande est entrée au fournil. Deux
 *   moments font exception et sont donc les seuls datés — la passation
 *   (`placedAt`) et la remise (`handedOverAt`).
 * - **Le coursier.** Ni son prénom ni son téléphone n'existent : la tournée de
 *   livraison n'est pas construite.
 * - **QUI a commandé.** `OrderView` porte l'auteur STAFF d'une saisie, jamais
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
  /** L'heure réelle, ou **vide** — le modèle ne date que deux étapes sur quatre. */
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
 * Quatre mots pour six statuts : `draft` n'atteint jamais cet écran, et
 * `cancelled` a le sien. Le client ne suit pas une machine à états, il suit un
 * pain.
 */
export type OrderRowStatus = 'ready' | 'route' | 'done' | 'delivered' | 'cancelled';

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

/** Les quatre étapes, dans l'ordre où le pain les franchit. */
const STEP_OF_STATUS: Readonly<Record<string, number>> = {
  placed: 0,
  confirmed: 1,
  in_production: 1,
  fulfilled: 3,
};

/** Une commande est-elle encore VIVANTE ? Le suivi ne montre que celles-là. */
export function isLive(order: OrderView): boolean {
  return order.status !== 'fulfilled' && order.status !== 'cancelled';
}

/** Le suivi d'une commande en cours. */
export function trackedOf(order: OrderView, copy: RowCopy): TrackedOrder {
  const at = STEP_OF_STATUS[order.status] ?? 0;
  const place = placeOf(order);
  return {
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
export function historyRowOf(order: OrderView, org: string, copy: RowCopy): HistoryOrder {
  return {
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

/** Les quatre étapes, datées **là où le modèle date**. */
function stepsOf(order: OrderView, copy: RowCopy): readonly TrackStep[] {
  const handed =
    order.fulfillmentMethod === 'pickup' ? copy.stepHandedPickup : copy.stepHandedDelivery;
  return [
    { label: copy.stepPlaced, at: hour(order.placedAt) },
    // ⚠️ Sans heure, et c'est exact : rien ne dit quand une commande entre au
    // fournil. Une heure plausible serait une heure fausse.
    { label: copy.stepBakery, at: '' },
    { label: copy.stepReady, at: '' },
    { label: handed, at: order.handedOverAt === null ? '' : hour(order.handedOverAt) },
  ];
}

function statusOf(order: OrderView): OrderRowStatus {
  if (order.status === 'cancelled') {
    return 'cancelled';
  }
  if (order.status === 'fulfilled') {
    return order.fulfillmentMethod === 'pickup' ? 'done' : 'delivered';
  }
  return order.status === 'in_production' ? 'route' : 'ready';
}

function originOf(order: OrderView): OrderOrigin {
  if (order.origin === 'recurring') {
    return 'recurring';
  }
  return order.origin === 'back_office' ? 'phone' : '';
}

/** Le nombre de pièces : la somme des quantités, pas le nombre de lignes. */
function piecesOf(order: OrderView): number {
  return order.lines.reduce((total, line) => total + line.quantity, 0);
}

function modeLabel(order: OrderView, copy: RowCopy): string {
  return order.fulfillmentMethod === 'pickup' ? copy.pickup : copy.delivery;
}

/** Le lieu figé sur la commande — jamais le réglage d'aujourd'hui. */
function placeOf(order: OrderView): string {
  const snapshot =
    order.fulfillmentMethod === 'pickup' ? order.pickupAddress : order.deliveryAddress;
  if (snapshot === null) {
    return '';
  }
  return snapshot.label.trim() === '' ? snapshot.ville : snapshot.label;
}

/** La tranche demandée, ou vide — un client peut n'en vouloir aucune. */
function windowOf(order: OrderView): string {
  const window: FulfillmentWindow | null = order.fulfillment.window.value;
  if (window === null) {
    return '';
  }
  return window.start === null ? window.end : `${window.start} – ${window.end}`;
}

/** `HH:MM` d'un instant ISO, dans le fuseau du lecteur. */
function hour(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
