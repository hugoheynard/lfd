/** Ce que les objets gardent : au-delà, il n'y a rien à lire. */
export const MAX_CACHE_METRICS_DAYS = 30;

/**
 * La période lue : un entier de 1 à {@link MAX_CACHE_METRICS_DAYS}, 30 par
 * défaut. Une saisie illisible ne fait pas échouer l'écran de diagnostic.
 */
export function resolveCacheMetricsDays(raw: string | undefined): number {
  const days = raw !== undefined && /^\d+$/u.test(raw) ? Number(raw) : MAX_CACHE_METRICS_DAYS;
  return Math.min(Math.max(days, 1), MAX_CACHE_METRICS_DAYS);
}
