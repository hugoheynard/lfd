import { describe, expect, it } from 'vitest';

import { pageParams } from './media-page-request';

describe('les paramètres d’une page du fonds', () => {
  it('ne porte que la taille quand rien n’est demandé', () => {
    expect(pageParams({ limit: 60 })).toEqual({ limit: '60' });
  });

  it('n’envoie pas un critère vide : une recherche blanche n’est pas un filtre', () => {
    expect(pageParams({ limit: 10, q: '   ', tags: [], from: '', series: '' })).toEqual({
      limit: '10',
    });
  });

  it('joint les mots-clés par une virgule, et marque les drapeaux par « 1 »', () => {
    expect(
      pageParams({
        limit: 10,
        q: ' croissant ',
        tags: ['pain', 'blé'],
        untagged: true,
        unused: true,
      }),
    ).toMatchObject({ q: 'croissant', tags: 'pain,blé', untagged: '1', unused: '1' });
  });

  it('reprend le curseur, le tri, les deux plages et la série tels quels', () => {
    expect(
      pageParams({
        limit: 10,
        after: 'c1',
        sort: 'name',
        from: '2026-01-01',
        to: '2026-01-31',
        shotFrom: '2025-12-01',
        shotTo: '2025-12-31',
        series: 'ser_1',
      }),
    ).toEqual({
      limit: '10',
      after: 'c1',
      sort: 'name',
      from: '2026-01-01',
      to: '2026-01-31',
      shotFrom: '2025-12-01',
      shotTo: '2025-12-31',
      series: 'ser_1',
    });
  });
});
