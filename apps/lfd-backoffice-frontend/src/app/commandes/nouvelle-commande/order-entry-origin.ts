/**
 * **D'où l'on saisit une commande** — le Commercial ou le Comptoir.
 *
 * Le même écran de saisie sert les deux, mais pas la même personne : au
 * comptoir, on n'a pas forcément les droits du Commercial. Tout lien qui
 * ramènerait vers `/comptes-clients` ou `/commercial` y mènerait à un refus du
 * garde. L'origine vit donc dans la `data` de la route, sous un nom, plutôt
 * qu'en booléen déduit de l'URL : c'est la route qui sait où elle a été montée.
 */
export type OrderEntryOrigin = 'commercial' | 'counter';

/** La clé de `data` qui porte l'origine. */
export const ORDER_ENTRY_ORIGIN_KEY = 'origin';

/** Le sélecteur de compte du comptoir — le retour de la saisie en contexte comptoir. */
export const COUNTER_ORDER_PICKER_LINK = '/comptoir/nouvelle-commande';

/**
 * Lit l'origine dans la `data` d'une route. L'absence vaut `commercial` : c'est
 * le comportement historique, et la route du Commercial ne déclare rien.
 */
export function orderEntryOriginOf(data: Readonly<Record<string, unknown>>): OrderEntryOrigin {
  return data[ORDER_ENTRY_ORIGIN_KEY] === 'counter' ? 'counter' : 'commercial';
}

/** Le lien retour de l'en-tête de saisie, et son libellé. */
export interface OrderEntryBackLink {
  // Mutable : `routerLink` ne prend pas de tableau `readonly`.
  readonly link: string[];
  readonly label: string;
}

/**
 * Le retour de l'en-tête : le dossier du compte au Commercial, le sélecteur
 * au comptoir — jamais `/comptes-clients` depuis le comptoir, dont le poste
 * n'a pas forcément le droit.
 */
export function backLinkOf(origin: OrderEntryOrigin, companyId: string): OrderEntryBackLink {
  return origin === 'counter'
    ? { link: [COUNTER_ORDER_PICKER_LINK], label: 'Retour au comptoir' }
    : { link: ['/comptes-clients', companyId, 'commandes'], label: 'Ses commandes' };
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
