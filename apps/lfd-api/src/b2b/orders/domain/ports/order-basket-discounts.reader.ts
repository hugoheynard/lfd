import type { FrozenBasketDiscount } from "../services/frozen-basket-discounts.js";

/**
 * **Les remises de panier figées d'une commande** (plan des promotions,
 * § 18.2, lot M4) — port de lecture déclaré par les commandes, lu par le
 * départ d'un bon de livraison pour en figer les parts
 * (`delivery_note_discounts`).
 *
 * L'adaptateur passe par le repli partagé (`frozenBasketDiscountsOf`) : la
 * table si la commande y a des lignes actives, sinon les colonnes comme une
 * remise de rang 1 — jamais `order_discounts` seule. Il rejoint l'unité de
 * travail de l'appelant.
 */
export abstract class OrderBasketDiscountsReader {
  /** Les remises dans leur ordre d'application ; vide sans remise ou commande inconnue. */
  abstract discountsOf(orderId: string): Promise<readonly FrozenBasketDiscount[]>;
}
