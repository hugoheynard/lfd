import { describe, expect, it } from 'vitest';

import { feedTailState, type FeedProgress } from './feed-tail-state';

const QUIET: FeedProgress = { failed: false, loading: false, hasMore: false, ended: false };

describe('le bas de la grille', () => {
  it('se tait sur un échec, que l’écran dit plus haut', () => {
    expect(feedTailState({ ...QUIET, failed: true, loading: true, hasMore: true })).toBe('idle');
  });

  it('dit qu’une page est en vol avant de dire qu’il en reste', () => {
    expect(feedTailState({ ...QUIET, loading: true, hasMore: true })).toBe('loading');
    expect(feedTailState({ ...QUIET, hasMore: true })).toBe('more');
  });

  it('dit la fin seulement quand le fil l’a atteinte', () => {
    expect(feedTailState({ ...QUIET, ended: true })).toBe('end');
    expect(feedTailState(QUIET)).toBe('idle');
  });
});
