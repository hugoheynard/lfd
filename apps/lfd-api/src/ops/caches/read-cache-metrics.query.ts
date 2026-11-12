/**
 * Requête **staff** : l'onglet Cache de la santé, sur `days` jours.
 *
 * `days` reste la saisie brute de l'appelant : la borner est une décision de
 * lecture ({@link resolveCacheMetricsDays}), pas une validation de forme.
 */
export class ReadCacheMetricsQuery {
  constructor(readonly days: string | undefined) {}
}
