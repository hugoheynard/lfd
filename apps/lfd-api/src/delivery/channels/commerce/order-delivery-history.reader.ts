/** Un arrêt d'une commande dans une tournée, tel que la livraison le garde. */
export interface OrderDeliveryStopFact {
  readonly orderId: string;
  /** `AAAA-MM-JJ` — le jour de la tournée. */
  readonly serviceDay: string;
  /** L'arrêt est entré dans la tournée (`delivery_round_stop.created_at`). */
  readonly placedAt: Date;
  /** La tournée est partie ; `null` tant qu'elle est au dépôt. */
  readonly departedAt: Date | null;
  /** L'arrêt est clos (remis, déposé, ou clos sans remise) ; `null` s'il est ouvert. */
  readonly closedAt: Date | null;
  /** Le commercial a décidé « Rapporter » sur CET arrêt ; `null` sinon. */
  readonly broughtBackAt: Date | null;
}

/**
 * **Les arrêts de ces commandes, pour le dossier de facturation** (plan
 * `documentation/comptabilite/facturation/plan-simulateur-dossier-de-facturation.md`, §3.3,
 * DF3).
 *
 * La livraison DÉCLARE et IMPLÉMENTE ce port, le commerce le lit — l'inverse
 * des autres lecteurs de ce canal, sur le modèle de `ContainerManagedOrders`
 * (`packing/channels/delivery/`). Les tournées, les arrêts et les décisions
 * lui appartiennent ; le commerce ne lit pas leurs tables.
 *
 * Les arrêts RETIRÉS d'une tournée ne sont pas rendus : la commande n'y a
 * jamais roulé. Par lot, sans N+1.
 */
export abstract class OrderDeliveryHistoryReader {
  /** Les arrêts non retirés de ces commandes, du plus ancien au plus récent. */
  abstract ofOrders(orderIds: readonly string[]): Promise<readonly OrderDeliveryStopFact[]>;
}
