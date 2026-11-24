import { describe, expect, it } from 'vitest';

import { ARTICLES } from './resupply-template.testing';
import { ALL_SHELVES, articlesOnShelf, resupplyShelvesOf } from './resupply-shelves';

const skus = (articles: readonly { sku: string }[]): string[] => articles.map((a) => a.sku);

describe('resupplyShelvesOf', () => {
  it('« Tout », puis une pastille par famille dans l’ordre du catalogue, à plat', () => {
    const shelves = resupplyShelvesOf(ARTICLES);
    expect(shelves.entries).toEqual([
      { id: ALL_SHELVES, label: 'Tout' },
      { id: 'fam_m', label: 'Viennoiseries' },
      { id: 'fam_b', label: 'Pains' },
    ]);
    expect([...shelves.families]).toEqual(['fam_m', 'fam_b']);
  });

  it('un catalogue vide n’a que « Tout »', () => {
    expect(resupplyShelvesOf([]).entries).toHaveLength(1);
  });
});

describe('articlesOnShelf', () => {
  it('« Tout » montre tout', () => {
    expect(skus(articlesOnShelf(ARTICLES, ALL_SHELVES, ''))).toEqual(['CRO', 'PAC', 'BAG']);
  });

  it('un rayon ne montre que sa famille', () => {
    expect(skus(articlesOnShelf(ARTICLES, 'fam_b', ''))).toEqual(['BAG']);
  });

  it('se combine avec la recherche', () => {
    expect(skus(articlesOnShelf(ARTICLES, 'fam_m', 'pain'))).toEqual(['PAC']);
    expect(skus(articlesOnShelf(ARTICLES, 'fam_b', 'croi'))).toEqual([]);
  });
});
