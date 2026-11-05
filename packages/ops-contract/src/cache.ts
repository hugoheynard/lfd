/** Une issue d'un cache de l'API, sur la fenêtre. */
export interface CacheOutcomeView {
  /** Le mot du producteur (`memory`, `hit`, `stamp_moved`…), tel qu'il l'a compté. */
  readonly outcome: string;
  readonly count: number;
  /** La part de cette issue dans le total du cache, entre 0 et 1. */
  readonly share: number;
}

/**
 * **Comment un cache de l'API a servi**, vu de l'intérieur (plan du cache du
 * catalogue, C5) : le total des questions sur la fenêtre, et la part de
 * chaque issue — la plus fréquente d'abord.
 *
 * Par instance : avec plusieurs conteneurs, chacun compte sa part.
 */
export interface CacheReport {
  /** Le nom du cache (`principal`, `shelf.read`, `pricing.materials`…). */
  readonly cache: string;
  readonly total: number;
  readonly windowMinutes: number;
  readonly outcomes: readonly CacheOutcomeView[];
}
