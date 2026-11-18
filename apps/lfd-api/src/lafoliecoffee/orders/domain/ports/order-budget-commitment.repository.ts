import type { OrderBudgetCommitment } from "../entities/order-budget-commitment.js";

/**
 * Port d'**écriture** de l'engagement budgétaire d'une commande (E3′) — il
 * prend et rend l'agrégat {@link OrderBudgetCommitment}.
 *
 * `lock` prend le verrou de la ligne `orders` que prend aussi l'émission de
 * la facture (`OrderRowsLock`) : une correction passe avant l'émission (le
 * bon sort de la facture, E4″) ou après (la commande est alors facturée, et
 * la correction refusée).
 */
export abstract class OrderBudgetCommitmentRepository {
  /** `SELECT … FOR UPDATE` sur `orders`, puis la relit ; `null` si inconnue. */
  abstract lock(orderId: string): Promise<OrderBudgetCommitment | null>;

  /** Écrit l'engagement que l'agrégat demande ; rien s'il n'a pas changé. */
  abstract save(commitment: OrderBudgetCommitment): Promise<void>;
}
