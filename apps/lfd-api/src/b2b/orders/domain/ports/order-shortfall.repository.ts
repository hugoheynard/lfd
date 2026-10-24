import type { OrderShortfall } from "../entities/order-shortfall.js";

/**
 * Port d'**écriture** du manque signalé (lot E6a) — `load` et `save` sur
 * l'agrégat, jamais une colonne posée à la main.
 *
 * `lock` n'a de sens que DANS une unité de travail : deux faits du colisage
 * livrés en même temps s'attendent sur la ligne `orders`, et le second voit
 * l'état que le premier a écrit.
 */
export abstract class OrderShortfallRepository {
  /** `SELECT … FOR UPDATE` par la référence, puis la relit ; `null` si inconnue. */
  abstract lock(reference: string): Promise<OrderShortfall | null>;

  abstract save(shortfall: OrderShortfall): Promise<void>;
}
