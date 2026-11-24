import { describe, expect, it } from 'vitest';

import type { ResupplyArticleView } from '@lfd/contracts';

import { ARTICLES } from '../resupply-templates/resupply-template.testing';
import { ALL_SHELVES, articlesOnShelf, resupplyShelvesOf } from './resupply-shelves';

const skus = (articles: readonly { sku: string }[]): string[] => articles.map((a) => a.sku);

const VIENNOISERIE = { id: 'fam_v', name: 'Viennoiserie', position: 0 };

/**
 * Une famille racine sans article à elle, et deux sous-familles : la racine
 * n'entre dans l'arbre que par la lignée de ses filles.
 */
const NESTED: readonly ResupplyArticleView[] = [
  {
    sku: 'CRO',
    name: 'Croissant',
    categoryId: 'fam_fine',
    categoryName: 'Viennoiserie fine',
    family: { id: 'fam_fine', name: 'Viennoiserie fine', position: 1, ancestors: [VIENNOISERIE] },
    saleUnit: 'piece',
  },
  {
    sku: 'BRI',
    name: 'Brioche',
    categoryId: 'fam_brio',
    categoryName: 'Brioches',
    family: { id: 'fam_brio', name: 'Brioches', position: 2, ancestors: [VIENNOISERIE] },
    saleUnit: 'piece',
  },
  {
    sku: 'BAG',
    name: 'Baguette',
    categoryId: 'fam_b',
    categoryName: 'Pains',
    family: { id: 'fam_b', name: 'Pains', position: 3 },
    saleUnit: 'piece',
  },
];

describe('resupplyShelvesOf', () => {
  it('« Tout », puis une pastille par famille dans l’ordre du catalogue', () => {
    const shelves = resupplyShelvesOf(ARTICLES);
    expect(shelves.entries).toEqual([
      { id: ALL_SHELVES, label: 'Tout' },
      { id: 'fam_m', label: 'Viennoiseries', parentId: null },
      { id: 'fam_b', label: 'Pains', parentId: null },
    ]);
    expect([...shelves.families]).toEqual(['fam_m', 'fam_b']);
  });

  it('range les sous-familles sous leur parente, même sans article à elle', () => {
    const shelves = resupplyShelvesOf(NESTED);
    expect(shelves.entries).toEqual([
      { id: ALL_SHELVES, label: 'Tout' },
      { id: 'fam_v', label: 'Viennoiserie', parentId: null },
      { id: 'fam_fine', label: 'Viennoiserie fine', parentId: 'fam_v' },
      { id: 'fam_brio', label: 'Brioches', parentId: 'fam_v' },
      { id: 'fam_b', label: 'Pains', parentId: null },
    ]);
    expect(shelves.families.has('fam_v')).toBe(true);
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

  it('une parente montre tout son sous-arbre, une sous-famille seulement la sienne', () => {
    expect(skus(articlesOnShelf(NESTED, 'fam_v', ''))).toEqual(['CRO', 'BRI']);
    expect(skus(articlesOnShelf(NESTED, 'fam_brio', ''))).toEqual(['BRI']);
  });

  it('se combine avec la recherche', () => {
    expect(skus(articlesOnShelf(ARTICLES, 'fam_m', 'pain'))).toEqual(['PAC']);
    expect(skus(articlesOnShelf(ARTICLES, 'fam_b', 'croi'))).toEqual([]);
  });
});
