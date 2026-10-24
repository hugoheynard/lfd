import type { ShortfallQuantity } from "../entities/order-shortfall.js";

/** Le manque signalé en vigueur sur une commande. */
export interface OrderShortfallReading {
  readonly reportedAt: Date;
  readonly lines: readonly ShortfallQuantity[];
}

/**
 * Port de **lecture** du manque signalé (lot E6a) — séparé du port d'écriture
 * (`OrderShortfallRepository`) : la fiche commande n'appelle que ceci.
 * Route staff, cross-tenant, gardée en amont par `b2b_orders`.
 */
export abstract class OrderShortfallReader {
  /** `null` : commande inconnue, ou aucun manque en vigueur. */
  abstract of(orderId: string): Promise<OrderShortfallReading | null>;
}
