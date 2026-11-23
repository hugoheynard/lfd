import { describe, expect, it } from 'vitest';

import { excludableProducts, familyDescendants } from './family-descendants';

const FAMILIES = [
  { id: 'patisserie', parentId: null },
  { id: 'gateaux', parentId: 'patisserie' },
  { id: 'entremets', parentId: 'gateaux' },
  { id: 'pain', parentId: null },
];

describe('familyDescendants', () => {
  it('rend la famille et toutes ses sous-familles, sur plusieurs niveaux', () => {
    expect([...familyDescendants(FAMILIES, 'patisserie')].sort()).toEqual([
      'entremets',
      'gateaux',
      'patisserie',
    ]);
  });

  it('ne remonte pas vers les parents', () => {
    expect([...familyDescendants(FAMILIES, 'gateaux')].sort()).toEqual(['entremets', 'gateaux']);
  });

  it('termine sur un arbre qui boucle', () => {
    const cyclic = [
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
    ];
    expect([...familyDescendants(cyclic, 'a')].sort()).toEqual(['a', 'b']);
  });
});

describe('excludableProducts', () => {
  const products = [
    { id: 'p1', categoryId: 'gateaux' },
    { id: 'p2', categoryId: 'entremets' },
    { id: 'p3', categoryId: 'pain' },
    { id: 'p4', categoryId: 'gateaux' },
  ];

  it('ne garde que la descendance, moins les produits déjà exclus', () => {
    const ids = excludableProducts(products, FAMILIES, 'gateaux', new Set(['p4'])).map(
      (product) => product.id,
    );
    expect(ids).toEqual(['p1', 'p2']);
  });
});
