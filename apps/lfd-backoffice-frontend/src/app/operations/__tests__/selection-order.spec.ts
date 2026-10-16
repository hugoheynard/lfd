import { describe, expect, it } from 'vitest';

import { moved, sameOrder, withoutSku, withSku } from '../selection-order';

describe('selection-order', () => {
  it('ajoute en fin, sans doubler', () => {
    expect(withSku(['a'], 'b')).toEqual(['a', 'b']);
    const same = ['a'];
    expect(withSku(same, 'a')).toBe(same);
  });

  it('retire', () => {
    expect(withoutSku(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });

  it('monte et descend sans muter la liste reçue', () => {
    const skus = ['a', 'b', 'c'] as const;
    expect(moved(skus, 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moved(skus, 1, 1)).toEqual(['a', 'c', 'b']);
    expect(skus).toEqual(['a', 'b', 'c']);
  });

  it('ne sort pas des bornes', () => {
    const skus = ['a', 'b'];
    expect(moved(skus, 0, -1)).toBe(skus);
    expect(moved(skus, 1, 1)).toBe(skus);
  });

  it('compare l’ordre, pas seulement le contenu', () => {
    expect(sameOrder(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameOrder(['a', 'b'], ['b', 'a'])).toBe(false);
  });
});
