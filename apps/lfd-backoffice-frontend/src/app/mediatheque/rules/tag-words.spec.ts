import { describe, expect, it } from 'vitest';

import { SUGGESTION_LIMIT, normalizeTag, rankedTags, searchKey, tagSuggestions } from './tag-words';

describe('les mots-clés', () => {
  it('s’écrivent découpés et en minuscules, comme le domaine les range', () => {
    expect(normalizeTag('  Pain Au Lait ')).toBe('pain au lait');
  });

  it('se cherchent sans accents, sans jamais écrire la clé', () => {
    expect(searchKey(' Éclair ')).toBe('eclair');
  });

  it('se rangent par compte puis par ordre alphabétique, filtrés n’importe où', () => {
    const all = [
      { tag: 'pain', count: 1 },
      { tag: 'croissant', count: 5 },
      { tag: 'éclair', count: 1 },
    ];
    expect(rankedTags(all, '').map((entry) => entry.tag)).toEqual(['croissant', 'éclair', 'pain']);
    expect(rankedTags(all, 'sant').map((entry) => entry.tag)).toEqual(['croissant']);
    expect(rankedTags(all, 'ECLAIR').map((entry) => entry.tag)).toEqual(['éclair']);
  });

  it('propose les mots qui CONTIENNENT la saisie, hors ceux portés', () => {
    const vocabulary = ['croissant', 'pain', 'saint-honoré', 'santé'];
    expect(tagSuggestions(vocabulary, 'sant', ['santé'])).toEqual(['croissant']);
    expect(tagSuggestions(vocabulary, '', [])).toEqual([]);
  });

  it('ne propose pas plus que la limite', () => {
    const many = Array.from({ length: 20 }, (_, at) => `mot${String(at)}`);
    expect(tagSuggestions(many, 'mot', [])).toHaveLength(SUGGESTION_LIMIT);
  });
});
