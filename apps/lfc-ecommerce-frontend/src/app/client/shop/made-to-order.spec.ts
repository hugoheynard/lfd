import { describe, expect, it } from 'vitest';

import { madeToOrderLabel } from './made-to-order';

const FORMS = {
  madeToOrderDays: 'Préparé sur commande — à commander {n} jours à l’avance, avant {time}',
  madeToOrderEve: 'Préparé sur commande — à commander la veille, avant {time}',
  madeToOrderSameDay: 'Préparé sur commande — à commander le jour même, avant {time}',
};

/** L'heure s'écrit avec des espaces insécables, comme partout (`formatHour`). */
describe('madeToOrderLabel', () => {
  it('deux jours avant à 12 h — la phrase de Hugo', () => {
    expect(madeToOrderLabel({ daysBefore: 2, time: '12:00' }, 'fr', FORMS)).toBe(
      'Préparé sur commande — à commander 2 jours à l’avance, avant 12\u00a0h',
    );
  });

  it('la veille à 18 h', () => {
    expect(madeToOrderLabel({ daysBefore: 1, time: '18:00' }, 'fr', FORMS)).toBe(
      'Préparé sur commande — à commander la veille, avant 18\u00a0h',
    );
  });

  it('le jour même à 9 h 30', () => {
    expect(madeToOrderLabel({ daysBefore: 0, time: '09:30' }, 'fr', FORMS)).toBe(
      'Préparé sur commande — à commander le jour même, avant 9\u00a0h\u00a030',
    );
  });

  it("rien quand le serveur n'en sert pas — l'article suit la règle générale", () => {
    expect(madeToOrderLabel(undefined, 'fr', FORMS)).toBeNull();
  });

  it("l'heure dans la forme de la langue, sans décalage de fuseau", () => {
    expect(madeToOrderLabel({ daysBefore: 1, time: '18:00' }, 'en', FORMS)).toContain('6:00');
  });
});
