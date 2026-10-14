/**
 * **Retirer de la liste à coliser les commandes d'un plan défait** — port
 * d'écriture étroit (réouverture d'une journée, Hugo, 2026-10-14). Séparé de
 * `PackingShadowLedger` (ISP) : un seul abonné l'appelle.
 */
export abstract class PackingListWithdrawal {
  /**
   * Retire de la journée les commandes de `orderIds` que personne n'a
   * touchées — aucun contenant (même annulé), aucune ligne au bac, ni bac
   * fermé ni contenants comptés. Une commande touchée reste : le fournil a
   * refusé la réouverture si le colisage avait commencé, et celle-là a
   * commencé entre sa question et ce retrait.
   *
   * @returns le nombre de commandes retirées ; zéro sur un rejeu.
   */
  abstract withdrawUntouched(serviceDay: string, orderIds: readonly string[]): Promise<number>;
}
