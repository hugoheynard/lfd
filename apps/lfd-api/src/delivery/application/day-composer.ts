/**
 * **Composer les tournées d'un jour** (2026-10-07) — ce que la préparation
 * d'un jour demande après avoir situé ses arrêts, et rien d'autre (ISP).
 * Implémenté par `DayAutoComposition`.
 */
export abstract class DayComposer {
  /** Rend le nombre de tournées appliquées ; 0 quand il n'y avait rien à placer. */
  abstract composeDay(day: string): Promise<number>;
}
