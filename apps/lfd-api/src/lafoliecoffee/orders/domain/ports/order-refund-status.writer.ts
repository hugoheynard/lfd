/**
 * **La vue « remboursée » d'une commande payée par carte** (plan M2, §3.3,
 * §3.6, lot P1.b) — ce que le commerce pose quand `card-payment` lui rend
 * l'issue d'un remboursement (`onRefundOutcome`), la position recalculée en
 * main.
 *
 * Deux écritures CONDITIONNÉES en base, comme `OrderRepository.markPaid` :
 * c'est la projection d'un état que `card-payment` tient, pas une mutation
 * d'agrégat — `Order` est un agrégat de passation qui ne connaît pas son
 * remboursement, et une load→save perdrait l'atomicité pour zéro invariant
 * de plus. La règle (« seule une commande `paid` devient `refunded` ») est
 * dans le `where`.
 */
export abstract class OrderRefundStatusWriter {
  /** `paid → refunded`. Rend `true` si la commande a franchi. */
  abstract markRefunded(orderId: string): Promise<boolean>;

  /** `refunded → paid` — une inversion a rouvert le reste. Rend `true` si elle a franchi. */
  abstract restorePaid(orderId: string): Promise<boolean>;
}
