import { CallBreaker } from "../../../platform/cache-calls/call-breaker.js";

export type { BreakerTransition } from "../../../platform/cache-calls/call-breaker.js";

/** Échecs consécutifs qui ouvrent le disjoncteur (`le-rayon-en-cache.md`, § 4 bis). */
export const SHELF_BREAKER_FAILURES = 5;

/** Le temps pendant lequel un disjoncteur ouvert n'appelle plus le magasin. */
export const SHELF_BREAKER_PAUSE_MS = 30_000;

/**
 * **Le disjoncteur du magasin des rayons pro** : le disjoncteur générique
 * ({@link CallBreaker}) aux seuils du rayon — {@link SHELF_BREAKER_FAILURES}
 * échecs de suite, {@link SHELF_BREAKER_PAUSE_MS} de pause.
 */
export class ShelfCacheBreaker extends CallBreaker {
  constructor() {
    super(SHELF_BREAKER_FAILURES, SHELF_BREAKER_PAUSE_MS);
  }
}
