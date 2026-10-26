import type { OrderShortfall } from "../entities/order-shortfall.js";

/**
 * Port d'**écriture** du manque signalé (lot E6a ; par envoi depuis le plan
 * E7 reliquat, lot LB) — `load` et `save` sur l'agrégat, jamais une colonne
 * posée à la main.
 *
 * `lock` n'a de sens que DANS une unité de travail : deux faits du colisage
 * livrés en même temps s'attendent sur la ligne `orders` — la commande, quel
 * que soit le rang, comme la décision —, et le second voit l'état que le
 * premier a écrit.
 */
export abstract class OrderShortfallRepository {
  /**
   * `SELECT … FOR UPDATE` de la commande par sa référence, puis le manque de
   * l'envoi `rank` (vide s'il n'en a jamais eu) ; `null` si la référence est
   * inconnue.
   */
  abstract lock(reference: string, rank: number): Promise<OrderShortfall | null>;

  abstract save(shortfall: OrderShortfall): Promise<void>;
}
