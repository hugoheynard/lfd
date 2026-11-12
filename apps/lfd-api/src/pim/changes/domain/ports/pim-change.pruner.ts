/**
 * Combien de temps une trace du journal du référentiel reste utile : sept
 * jours, la durée des autres journaux de version.
 */
export const PIM_CHANGE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * **Balayer le journal du référentiel** (`pim.pim_change`) — le seul geste de
 * code qui y écrive : ses lignes naissent des déclencheurs.
 */
export abstract class PimChangePruner {
  /** Retire les traces écrites avant cet instant ; rend combien. */
  abstract pruneBefore(instant: Date): Promise<number>;
}
