import { describe, expect, it } from 'vitest';

import { readyByLabel } from './packing-ready-by';

describe('readyByLabel — l’heure « prête pour », et d’où elle vient (L2)', () => {
  it('dit la tournée, le transfert ou le créneau', () => {
    expect(
      readyByLabel({ fulfillmentMethod: 'delivery', readyBy: '07:10', readyBySource: 'round' }),
    ).toBe('Prête pour 07 h 10 · départ de la tournée');
    expect(
      readyByLabel({ fulfillmentMethod: 'pickup', readyBy: '06:30', readyBySource: 'transfer' }),
    ).toBe('Prête pour 06 h 30 · départ du transfert');
    expect(
      readyByLabel({ fulfillmentMethod: 'pickup', readyBy: '07:45', readyBySource: 'due' }),
    ).toBe('Prête pour 07 h 45 · créneau du retrait');
  });

  it('une livraison sans tournée n’a pas encore de départ ; un retrait sans créneau, pas d’heure', () => {
    expect(
      readyByLabel({ fulfillmentMethod: 'delivery', readyBy: null, readyBySource: null }),
    ).toBe('Pas encore de départ');
    expect(readyByLabel({ fulfillmentMethod: 'pickup', readyBy: null, readyBySource: null })).toBe(
      'Sans heure',
    );
  });

  it('une fiche qui ne porte pas l’heure n’affiche rien — jamais une heure devinée', () => {
    expect(readyByLabel({ fulfillmentMethod: 'delivery' })).toBeNull();
  });
});
