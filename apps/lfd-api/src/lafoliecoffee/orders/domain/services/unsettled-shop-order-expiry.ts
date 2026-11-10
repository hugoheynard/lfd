/**
 * **Le délai de vie d'une commande boutique non réglée** (plan
 * `documentation/commandes/reglement/commande-carte-reglee.md`, §2.3, §4.5).
 *
 * Une commande que le particulier passe lui-même à la boutique, réglée par
 * carte, est écrite AVANT le paiement. Passé ce délai sans encaissement, elle
 * est annulée avec son intention : elle n'était qu'un paiement qui n'a pas eu
 * lieu, pas une commande.
 *
 * ⚠️ La promesse tenue est « **au plus 35 minutes** », pas 30 : le balayage
 * passe sur le cron de rafraîchissement du Worker, toutes les cinq minutes.
 */
export const UNSETTLED_SHOP_ORDER_TTL_MINUTES = 30;

const MILLISECONDS_PER_MINUTE = 60_000;

/**
 * L'instant avant lequel une commande boutique non réglée a expiré : une
 * commande passée strictement avant lui est expirée, une passée à cet instant
 * ou après ne l'est pas encore.
 */
export function unsettledShopOrderCutoff(now: Date): Date {
  return new Date(now.getTime() - UNSETTLED_SHOP_ORDER_TTL_MINUTES * MILLISECONDS_PER_MINUTE);
}

/**
 * **L'instant avant lequel une commande sur stock non réglée a rendu sa
 * part** (plan du jour J, §3 Q3 et §11.2, lot L4) : un paiement en cours tient
 * le stock pendant la durée réglée en admin (`shelf_hold_minutes`, Réglages ›
 * Commandes › Jour même), puis la commande est annulée avec son intention et
 * sa quantité revient en vitrine. Même promesse « au plus cinq minutes de
 * plus » que la boutique : c'est le même balayage.
 */
export function shelfOrderHoldCutoff(now: Date, holdMinutes: number): Date {
  return new Date(now.getTime() - holdMinutes * MILLISECONDS_PER_MINUTE);
}
