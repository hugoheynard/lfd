import { FIRST_SHIPMENT_RANK } from "../../../../production/channels/commerce/index.js";

/** Ce qu'on écrit dans le journal quand un fait d'envoi est ignoré. */
export interface IgnoredShipmentTrace {
  readonly warn: (message: string) => void;
}

/**
 * **Un fait d'envoi de rang > 1 n'agit pas sur la commande** (plan
 * `documentation/commandes/plan-e7-reliquat-bati.md`, §3 bis, trou ouvert par
 * L3a et fermé en tête de L3b, 2026-10-26).
 *
 * Les abonnés du commerce à `packing.order_packed`, `handover.handed_over` et
 * `packing.shortfall_*` agissent sur la COMMANDE : prête, remise, en manque.
 * Un fait de reliquat qui y passerait déclarerait la commande entière prête
 * ou remise alors que seul son reste l'est. Tant que L4 (prêt et retrait par
 * envoi) et LB (manque par envoi) n'existent pas, un tel fait est **ignoré**,
 * et la trace le dit : le message est acquitté, rien n'est écrit.
 *
 * @returns `true` si le fait est de rang 1 et doit être appliqué.
 */
export function appliesToOrder(
  fact: { readonly rank: number; readonly orderId: string },
  factType: string,
  trace: IgnoredShipmentTrace,
): boolean {
  if (fact.rank === FIRST_SHIPMENT_RANK) {
    return true;
  }
  trace.warn(
    `Fait « ${factType} » du reliquat de rang ${String(fact.rank)} de la commande ${fact.orderId} ignoré : ` +
      "le commerce ne sait pas encore rendre prête, remise ou en manque un envoi seul " +
      "(plan E7 reliquat, lots L4 et LB). La commande n'a pas été touchée.",
  );
  return false;
}
