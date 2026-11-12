/**
 * Combien de temps une trace du journal des commandes reste utile : sept
 * jours, la durée du journal des journées.
 */
export const ORDER_CHANGE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * **Balayer le journal de toutes les commandes** (`public.order_change`) —
 * le seul geste de code qui y écrive : ses lignes naissent des déclencheurs.
 */
export abstract class OrderChangePruner {
  /** Retire les traces écrites avant cet instant ; rend combien. */
  abstract pruneBefore(instant: Date): Promise<number>;
}
