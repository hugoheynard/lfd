/** Une issue d'un cache, comptée sur la fenêtre. */
export interface CacheOutcomeCount {
  readonly outcome: string;
  readonly count: number;
  /** La part de cette issue dans le total du cache, entre 0 et 1. */
  readonly share: number;
}

/** Un cache et ce qu'il a rendu sur la fenêtre, issues par compte décroissant. */
export interface CacheOutcomeTally {
  readonly cache: string;
  readonly total: number;
  readonly outcomes: readonly CacheOutcomeCount[];
}

/**
 * Port de **lecture** des issues de cache : par cache, le total et la part de
 * chaque issue sur la fenêtre glissante. Ce que veut dire une issue
 * appartient au producteur ; le lecteur ne fait que compter.
 */
export abstract class CacheOutcomeReader {
  /** La fenêtre glissante, en minutes — pour que l'écran la nomme. */
  abstract readonly windowMinutes: number;

  /** Les caches qui ont compté quelque chose sur la fenêtre, par nom. */
  abstract read(): readonly CacheOutcomeTally[];
}
