import type { OrderStatus } from "@lfd/contracts";

/**
 * Les deux statuts qu'une remise du rang 1 peut écrire (plan
 * `documentation/commandes/plan-e7-reliquat-bati.md`, choix 8, lot L5b).
 */
export type FirstHandoverStatus = Extract<OrderStatus, "fulfilled" | "partially_handed_over">;

/**
 * **Soldée = plus aucun envoi vivant à remettre** (choix 8). La remise du
 * rang 1 solde la commande, sauf si un reste vivant attend encore son retrait :
 * elle est alors « en partie retirée », et rien n'en est facturable.
 *
 * Un reste abandonné n'est pas vivant (Q-R3) : la commande se solde à la
 * remise de ce qui est parti, comme depuis E6.
 */
export function statusAfterFirstHandover(pendingRemainder: boolean): FirstHandoverStatus {
  return pendingRemainder ? "partially_handed_over" : "fulfilled";
}

/**
 * La remise d'un reste solde-t-elle la commande ? Seulement si son rang 1 est
 * déjà retiré (`partially_handed_over`) et qu'aucun autre reste n'attend.
 * Un reste retiré AVANT le rang 1 ne solde rien : c'est la remise du rang 1
 * qui le fera, en ne trouvant plus rien en attente.
 */
export function settlesOnRemainder(status: OrderStatus, pendingRemainder: boolean): boolean {
  return status === "partially_handed_over" && !pendingRemainder;
}
