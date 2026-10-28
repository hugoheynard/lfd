/** Les commandes d'un SKU qui attendent le four, sans nom de client. */
export interface OvenWaitingOrders {
  /** Combien de commandes, ≥ 1. */
  readonly count: number;
  /** La plus proche heure « prête pour », `HH:mm` ; `null` = aucune connue. */
  readonly earliestHandover: string | null;
}

/**
 * **« Quelles commandes du jour attendent le four, SKU par SKU ? »** — port
 * étroit que le fournil DÉCLARE et que le colisage IMPLÉMENTE (plan
 * `documentation/fournil/plan-fournee-v3.md`, §3 ; Hugo, 2026-10-28).
 *
 * « Attend le four » est la règle de la Supervision (`awaitingProduction`) :
 * une ligne ouverte dont le reste à poser dépasse le libre de la réserve.
 * Seul le colisage tient la réserve et les bacs ; le fournil ne lit que la
 * réponse, pour l'écrire sur la ligne de sa fiche d'atelier.
 *
 * Un SKU absent de la carte n'attend rien. Une journée dont la liste n'est
 * pas arrivée au colisage rend une carte vide.
 */
export abstract class OvenWaitingOrdersReader {
  abstract waitingOn(serviceDay: string): Promise<ReadonlyMap<string, OvenWaitingOrders>>;
}
