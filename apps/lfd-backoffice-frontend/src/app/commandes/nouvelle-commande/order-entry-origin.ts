import {
  DEFAULT_ORDER_ENTRY_RETURN,
  pointOf,
  returnLabelOf,
  returnTargetOf,
} from './order-entry-return';

/**
 * **D'où l'on saisit une commande** — le Commercial ou le Comptoir.
 *
 * Une seule page, une seule adresse (`/nouvelle-commande/:id`, décidé par
 * Hugo le 2026-11-21) : le comptoir se reconnaît au **point de retrait** qu'il
 * passe à la saisie (`?point=`), et au droit `b2b_counter:read` de la
 * personne — sans lui, un point tapé dans l'adresse fabriquerait la trace
 * « comptoir ». Au comptoir, le lien de règlement est refusé (E4) et le
 * retrait immédiat proposé ; ailleurs, les règles du commercial.
 */
export type OrderEntryOrigin = 'commercial' | 'counter';

/** Le sélecteur de compte du comptoir — le retour de la saisie en contexte comptoir. */
export const COUNTER_ORDER_PICKER_LINK = '/nouvelle-commande/pro';

/** La saisie d'un compte au comptoir : `/nouvelle-commande/:id`. */
export const COUNTER_ORDER_ENTRY_LINK = '/nouvelle-commande';

/** Le comptoir : son point dans l'adresse, et le droit de la personne. */
export function orderEntryOriginOf(
  point: string | undefined,
  canCounter: boolean,
): OrderEntryOrigin {
  return pointOf(point) !== null && canCounter ? 'counter' : 'commercial';
}

/** Le lien retour de l'en-tête de saisie, et son libellé. */
export interface OrderEntryBackLink {
  // Mutable : `routerLink` ne prend pas de tableau `readonly`.
  readonly link: string[];
  /** Les paramètres de la cible, ou `null` pour garder ceux de la saisie. */
  readonly queryParams: Readonly<Record<string, string>> | null;
  readonly label: string;
}

/**
 * Le retour de l'en-tête : au comptoir, le sélecteur de compte (l'origine et
 * le point suivent) ; ailleurs, l'écran d'où l'on est venu (`retour`).
 */
export function backLinkOf(
  origin: OrderEntryOrigin,
  retour: string | undefined,
): OrderEntryBackLink {
  if (origin === 'counter') {
    return {
      link: [COUNTER_ORDER_PICKER_LINK],
      queryParams: null,
      label: 'Choisir un autre compte',
    };
  }
  const target = returnTargetOf(retour);
  const [path = DEFAULT_ORDER_ENTRY_RETURN, query = ''] = target.split('?', 2);
  return {
    link: [path],
    queryParams: Object.fromEntries(new URLSearchParams(query)),
    label: returnLabelOf(target),
  };
}

/**
 * Où aller une fois la commande passée. Au Commercial, dans le dossier du
 * compte : la suite (en repasser une, vérifier la facturation) s'y trouve. Au
 * comptoir, retour au sélecteur, qui affiche le lien de règlement.
 */
export function destinationAfterPlacingOf(
  origin: OrderEntryOrigin,
  companyId: string,
  orderId: string,
): string[] {
  return origin === 'counter'
    ? [COUNTER_ORDER_PICKER_LINK]
    : ['/comptes-clients', companyId, 'commandes', orderId];
}

/**
 * Ce que la saisie transmet au sélecteur du comptoir après une commande, par
 * l'état de navigation : le client est EN FACE, le lien de règlement doit donc
 * s'afficher à l'écran et pas seulement partir dans le presse-papiers.
 */
export interface CounterPlacedOrder {
  readonly orderNumber: string;
  readonly paymentUrl: string | null;
  /** Le « Valider et remettre » du retrait immédiat (lot L6) — `null` hors raccourci. */
  readonly handover: CounterHandoverOutcome | null;
}

/**
 * Ce qu'est devenue la remise enchaînée à la passation : remise (`refusal`
 * `null`, le bon peut se réimprimer), ou refusée — la commande est PASSÉE mais
 * pas remise, et le refus du serveur le dit.
 */
export interface CounterHandoverOutcome {
  readonly orderId: string;
  readonly refusal: string | null;
}

/** La clé de l'état de navigation qui porte {@link CounterPlacedOrder}. */
export const COUNTER_PLACED_ORDER_KEY = 'counterPlacedOrder';

/**
 * Relit {@link CounterPlacedOrder} dans un état de navigation. L'état vient
 * de `history.state` : un rechargement ou un autre onglet peuvent y laisser
 * n'importe quoi, d'où la vérification de forme plutôt qu'une conversion.
 */
export function counterPlacedOrderOf(state: unknown): CounterPlacedOrder | null {
  if (typeof state !== 'object' || state === null || !(COUNTER_PLACED_ORDER_KEY in state)) {
    return null;
  }
  const value: unknown = state[COUNTER_PLACED_ORDER_KEY];
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const orderNumber = 'orderNumber' in value ? value.orderNumber : undefined;
  const paymentUrl = 'paymentUrl' in value ? value.paymentUrl : undefined;
  if (typeof orderNumber !== 'string' || (typeof paymentUrl !== 'string' && paymentUrl !== null)) {
    return null;
  }
  const handover = 'handover' in value ? handoverOf(value.handover) : null;
  return { orderNumber, paymentUrl, handover };
}

/** Relit {@link CounterHandoverOutcome} ; une forme inattendue vaut « pas de remise ». */
function handoverOf(value: unknown): CounterHandoverOutcome | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const orderId = 'orderId' in value ? value.orderId : undefined;
  const refusal = 'refusal' in value ? value.refusal : undefined;
  if (typeof orderId !== 'string' || (typeof refusal !== 'string' && refusal !== null)) {
    return null;
  }
  return { orderId, refusal };
}
