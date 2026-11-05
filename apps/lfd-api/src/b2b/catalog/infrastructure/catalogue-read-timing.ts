import { timeServerTimingSpan } from "../../../platform/metrics/server-timing.js";

/**
 * Le nom de la marque `Server-Timing` qui cumule les lectures du catalogue
 * dans une requête (`catalogue` et `catalogue-reads`). Les lecteurs relevés
 * par M0 (`documentation/caching-usage/plan-materiaux-du-catalogue.md`, § 1)
 * l'appellent autour de CHAQUE appel au client : une lecture = un appel
 * compté, la même unité que le relevé.
 */
export const CATALOGUE_TIMING = "catalogue";

/** Chronomètre un appel de lecture du catalogue (sans effet hors requête). */
export function timeCatalogueRead<T>(work: () => Promise<T>): Promise<T> {
  return timeServerTimingSpan(CATALOGUE_TIMING, work);
}
