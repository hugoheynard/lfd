import { describe, expect, it } from 'vitest';

import { batchName, batchWithOrders, capitalized } from './batch-wording';

const DAY = { weekday: 'mar.', dayMonth: '3 nov.' };

describe('batchName', () => {
  it('nomme la fournée par le moment où elle passe au four', () => {
    expect(batchName('2026-11-02', '2026-11-02')).toBe('la fournée de ce matin');
    expect(batchName('2026-11-03', '2026-11-02')).toBe('la fournée de demain');
    expect(batchName('2026-11-05', '2026-11-02')).toBe('la fournée');
  });

  it('demain franchit la fin du mois', () => {
    expect(batchName('2026-12-01', '2026-11-30')).toBe('la fournée de demain');
  });
});

describe('batchWithOrders', () => {
  it('dit le jour des commandes à côté de la fournée', () => {
    expect(batchWithOrders('2026-11-03', '2026-11-02', DAY)).toBe(
      'la fournée de demain (commandes du mar. 3 nov.)',
    );
  });

  it('capitalized met la majuscule en tête de phrase', () => {
    expect(capitalized('la fournée')).toBe('La fournée');
  });
});
