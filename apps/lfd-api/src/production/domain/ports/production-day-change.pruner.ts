/**
 * Combien de temps une trace du journal des journées reste utile : sept jours.
 * Seule la plus récente d'une journée compte, et aucun écran ne veille en
 * direct une journée d'il y a un mois (plan `plan-version-par-journee.md`, D2).
 */
export const DAY_CHANGE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * **Balayer le journal des journées** du fournil — le seul geste de code qui
 * y écrive : ses lignes, elles, naissent des déclencheurs de la base (D1).
 */
export abstract class ProductionDayChangePruner {
  /** Retire les traces écrites avant cet instant ; rend combien. */
  abstract pruneBefore(instant: Date): Promise<number>;
}
