import type { OrderBilling } from "../entities/order-billing.js";

/**
 * Port d'**écriture** du solde d'une commande (lot E6c1) — il prend et rend
 * l'agrégat {@link OrderBilling}. Deux écrivains seulement : le suivi du BL à
 * la remise, et le réconciliateur des BL pour l'existant (plan § 13).
 *
 * L'exclusion entre les deux est dans le `WHERE` : une pose (`closed`) ne
 * franchit que si `billable_total_cents IS NULL`, sous le verrou de la
 * commande que l'appelant tient déjà.
 */
export abstract class OrderBillingRepository {
  /** Sans verrou, pour trier : les commandes de ces identifiants. */
  abstract load(orderIds: readonly string[]): Promise<readonly OrderBilling[]>;

  /** `SELECT … FOR UPDATE` sur `orders`, puis la relit ; `null` si inconnue. */
  abstract lock(orderId: string): Promise<OrderBilling | null>;

  /** Écrit ce que l'agrégat demande ; `false` si l'écriture conditionnelle n'a pas franchi. */
  abstract save(billing: OrderBilling): Promise<boolean>;
}
