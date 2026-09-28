/**
 * Combien de temps une trace du journal des journées reste utile : sept jours
 * (plan `plan-version-par-journee.md`, D2). Même durée que le journal du
 * fournil, recopiée et non importée : les deux blocs ne se lisent pas.
 */
export const ORDER_DAY_CHANGE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * **Balayer le journal des journées** du commerce — le seul geste de code qui
 * y écrive : ses lignes naissent des déclencheurs de `orders` (D1).
 */
export abstract class OrderDayChangePruner {
  /** Retire les traces écrites avant cet instant ; rend combien. */
  abstract pruneBefore(instant: Date): Promise<number>;
}
