/**
 * **Rendre au client les commandes d'un plan défait** — port d'écriture
 * étroit, séparé d'`OrderRepository` (ISP) : un seul abonné l'appelle, la
 * réouverture d'une journée (Hugo, 2026-10-14).
 *
 * Le pendant exact d'`OrderRepository.absorbIntoPlan`, et pour la même raison
 * une écriture d'ensemble : la règle porte sur l'ÉTAT, elle est la même pour
 * toutes les commandes de la journée.
 */
export abstract class OrderPlanRelease {
  /**
   * `confirmed` → `placed`, `confirmedAt` effacé — pour les seules commandes
   * de `orderIds`, confirmées par l'arrêt de `closedAt`, et pas encore
   * prêtes. Une commande confirmée par un AUTRE arrêt, prête, annulée ou
   * remise n'est pas touchée.
   *
   * @returns le nombre de commandes rendues ; zéro sur un rejeu.
   */
  abstract releaseFromPlan(
    serviceDay: string,
    orderIds: readonly string[],
    closedAt: Date,
  ): Promise<number>;
}
