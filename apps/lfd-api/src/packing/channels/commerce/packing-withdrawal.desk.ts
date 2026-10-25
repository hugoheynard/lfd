/**
 * Ce que le colisage a constaté :
 *
 * - `withdrawn` — la feuille est retirée (ou l'était déjà), ses contenants
 *   annulés, ce qu'ils portaient revenu à la réserve ; ou la pierre tombale
 *   est posée, si la liste à coliser n'est pas encore arrivée ;
 * - `packed` — le bac est fermé : la commande est prête, rien n'est écrit ;
 * - `delivery_bin` — un contenant porte un bac de livraison vivant : on ne
 *   défait jamais un bac (décision C7), rien n'est écrit.
 */
export type PackingWithdrawalOutcome = "withdrawn" | "packed" | "delivery_bin";

/**
 * **Le guichet du retrait au colisage** (plan A1,
 * `documentation/commandes/annulation/plan-a1-retirer-une-commande-inscrite.md`,
 * § 2.1–2.2) — déclaré ET implémenté par le colisage, appelé par le commerce
 * quand il annule une commande de particulier déjà inscrite au plan. Même
 * figure que {@link ShortfallDesk} (R3b) : le commerce appelle le colisage en
 * direct, sans détour par le fournil.
 *
 * 🔴 **Dans l'unité de travail de l'appelant**, APRÈS le guichet du fournil :
 * ordre des verrous ligne `orders` → journée → feuille → bac → réserve triée
 * par SKU (§ 2.4). Un refus de l'appelant ensuite défait tout, feuille
 * comprise.
 *
 * `packing → b2b` reste interdit : le colisage ne sait pas qui l'appelle.
 */
export abstract class PackingWithdrawalDesk {
  /**
   * Retire la feuille de cette commande, ou dit pourquoi elle ne se retire pas.
   *
   * @param withdrawnBy l'auteur de l'annulation, recopié sur les contenants
   *   annulés (`voided_by`) — opaque pour le colisage.
   */
  abstract withdraw(
    serviceDay: string,
    orderId: string,
    withdrawnBy: string,
  ): Promise<PackingWithdrawalOutcome>;
}
