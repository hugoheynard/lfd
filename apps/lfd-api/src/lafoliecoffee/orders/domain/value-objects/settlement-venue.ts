/**
 * **Où le règlement se fera, quand ce n'est pas chez nous** (Hugo,
 * 2026-11-20). `shop_till` : à la caisse de la boutique — une commande d'un
 * particulier notée au comptoir.
 *
 * Ce n'est pas un état du paiement : notre système ne sait JAMAIS qu'une
 * telle commande est payée (`documentation/comptabilite/caisse/pas-de-logiciel-de-caisse.md`).
 * Son `paymentStatus` reste `not_required`, et le lieu dit où l'argent sera
 * pris. Figé à la passation : la base refuse sa modification
 * (`orders_settlement_venue_frozen`) et tient sa forme (`orders_shop_till_shape`).
 */
export const SETTLEMENT_VENUES = ["shop_till"] as const;

export type SettlementVenue = (typeof SETTLEMENT_VENUES)[number];
