/**
 * Ce que le bas de la grille a à dire :
 * - `more` — il reste à lire ;
 * - `loading` — une page est en vol ;
 * - `end` — tout est lu, après plus d'une page ;
 * - `idle` — rien à dire (une seule page, ou un échec que l'écran dit ailleurs).
 */
export type FeedTailState = 'more' | 'loading' | 'end' | 'idle';

/** Ce que le fil sait de lui-même, tel que le bas de la grille le lit. */
export interface FeedProgress {
  readonly failed: boolean;
  readonly loading: boolean;
  readonly hasMore: boolean;
  readonly ended: boolean;
}

/** Ce que le bas de la grille dit. Un échec se dit au-dessus, pas ici. */
export function feedTailState(progress: FeedProgress): FeedTailState {
  if (progress.failed) {
    return 'idle';
  }
  if (progress.loading) {
    return 'loading';
  }
  if (progress.hasMore) {
    return 'more';
  }
  return progress.ended ? 'end' : 'idle';
}
