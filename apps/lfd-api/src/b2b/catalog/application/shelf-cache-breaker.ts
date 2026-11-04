/** Échecs consécutifs qui ouvrent le disjoncteur (`plan-cache-du-catalogue.md`, § 4 bis). */
export const SHELF_BREAKER_FAILURES = 5;

/** Le temps pendant lequel un disjoncteur ouvert n'appelle plus le magasin. */
export const SHELF_BREAKER_PAUSE_MS = 30_000;

/** Ce qu'un échec ou un succès a fait au disjoncteur, pour le compter. */
export type BreakerTransition = "opened" | "closed" | null;

/**
 * **Le disjoncteur du magasin des rayons pro** : après
 * {@link SHELF_BREAKER_FAILURES} échecs de suite, plus aucun appel pendant
 * {@link SHELF_BREAKER_PAUSE_MS} — une panne durable ne fait pas payer le
 * délai à chaque visite. La pause passée, les appels repartent : un succès le
 * referme, un échec le rouvre pour une nouvelle pause.
 *
 * Pur : l'instant lui est donné (`WallClock`, la durée d'une pause n'est pas
 * un fait métier). L'essai d'après la pause n'est pas exclusif : plusieurs
 * requêtes simultanées peuvent essayer ensemble, chacune bornée par le délai.
 */
export class ShelfCacheBreaker {
  private failures = 0;
  private openUntilMs: number | null = null;

  /** Vrai si un appel peut partir à cet instant. */
  allows(nowMs: number): boolean {
    return this.openUntilMs === null || nowMs >= this.openUntilMs;
  }

  /** Un appel a abouti. */
  succeeded(): BreakerTransition {
    const wasOpen = this.openUntilMs !== null;
    this.failures = 0;
    this.openUntilMs = null;
    return wasOpen ? "closed" : null;
  }

  /** Un appel a échoué (erreur, délai, réponse illisible). */
  failed(nowMs: number): BreakerTransition {
    this.failures += 1;
    if (this.openUntilMs === null && this.failures < SHELF_BREAKER_FAILURES) {
      return null;
    }
    this.openUntilMs = nowMs + SHELF_BREAKER_PAUSE_MS;
    return "opened";
  }

  /** Les échecs de suite comptés depuis le dernier succès. */
  consecutiveFailures(): number {
    return this.failures;
  }
}
