/**
 * Port d'**écriture** du solde d'une commande en partie retirée (plan
 * `documentation/commandes/plan-e7-reliquat-bati.md`, lot L5b).
 *
 * Même nature que `OrderRepository.markFulfilled`, et pour la même raison :
 * la projection d'un fait du retrait, conditionnée en base
 * (`partially_handed_over` → `fulfilled`), idempotente. La règle — plus aucun
 * reste à remettre — est jugée avant, sous le verrou de la commande
 * (`settlesOnRemainder`). Port à part (ISP) : un seul écrivain s'en sert.
 */
export abstract class SettledOrderWriter {
  /** `false` : la commande n'était pas en partie retirée (déjà soldée, annulée, ou rang 1 pas retiré). */
  abstract settle(orderId: string): Promise<boolean>;
}
