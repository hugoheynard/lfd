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

/**
 * **Combien de temps prend un appel à un magasin de cache** (C5, 2026-11-05) —
 * aujourd'hui l'objet des rayons pro, par opération (`read`, `store`,
 * `erase`…). C'est la mesure qui dira si le délai du repli (100 ms) est juste.
 *
 * Par instance, sur la fenêtre des minuteurs (30 min).
 */
export interface CacheCallReport {
  /** Le magasin appelé (`shelf_cache`). */
  readonly store: string;
  /** L'opération, au mot du producteur. */
  readonly operation: string;
  readonly calls: number;
  /** Les appels abandonnés au délai — leur durée compte jusqu'à l'abandon. */
  readonly late: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  /**
   * Le p95 de la durée FINALE des appels abandonnés, quand ils ont fini par
   * répondre ou échouer ; `null` si aucun n'a fini sur la fenêtre.
   */
  readonly lateFinishP95Ms: number | null;
  readonly windowMinutes: number;
}
