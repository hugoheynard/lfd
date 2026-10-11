import { describe, expect, it } from 'vitest';

import type { SpaceNode } from '../../rules/space-tree';
import { spaceBadge } from './space-tree';

const NODE: SpaceNode = {
  space: 'cart',
  title: 'Panier',
  journey: true,
  count: 3,
  modified: 0,
  pending: 0,
  stale: 0,
};

describe('spaceBadge — la pastille la plus pressante', () => {
  it('ce qui attend Publier passe d’abord', () => {
    expect(spaceBadge({ ...NODE, pending: 2, stale: 1, modified: 1 })).toEqual({
      text: '2 à publier',
      tone: 'warning',
    });
  });

  it('puis une traduction en retard, puis ce qui est modifié en ligne', () => {
    expect(spaceBadge({ ...NODE, stale: 1, modified: 3 })).toEqual({
      text: '1 traduction en retard',
      tone: 'alert',
    });
    expect(spaceBadge({ ...NODE, modified: 2 })).toEqual({ text: '2 modifiés', tone: 'info' });
  });

  it('rien à dire, aucune pastille', () => {
    expect(spaceBadge(NODE)).toBeNull();
  });
});
