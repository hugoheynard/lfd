import { describe, expect, it } from 'vitest';

import {
  type EditorBlock,
  moveItem,
  removeItem,
  replaceItem,
  setTone,
  toneOf,
} from '../storefront-block';

const card: EditorBlock = { id: 'c', format: 'card', column: 1, row: 1, shelves: ['all'] };

describe('le ton', () => {
  it('par défaut : clair', () => {
    expect(toneOf(card)).toBe('light');
  });

  it('setTone règle le seul objet visé', () => {
    const other: EditorBlock = { ...card, id: 'o' };
    const [changed, untouched] = setTone([card, other], 'c', 'dark');
    expect(changed?.tone).toBe('dark');
    expect(untouched).toBe(other);
  });
});

describe('la liste des contenus', () => {
  it('déplace d’un cran, et ne sort jamais des bornes', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    const items = ['a', 'b'];
    expect(moveItem(items, 0, -1)).toBe(items);
    expect(moveItem(items, 1, 1)).toBe(items);
  });

  it('retire et remplace le seul rang visé', () => {
    expect(removeItem(['a', 'b', 'c'], 1)).toEqual(['a', 'c']);
    expect(replaceItem(['a', 'b'], 1, 'z')).toEqual(['a', 'z']);
  });
});
