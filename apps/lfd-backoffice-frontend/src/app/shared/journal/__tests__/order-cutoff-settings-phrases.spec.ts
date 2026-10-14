import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/** **L'interrupteur de l'heure limite générale** (`order_cutoff_settings.updated`, lot O3). */

function updated(payload: Readonly<Record<string, unknown>>): FactInput {
  return {
    type: 'order_cutoff_settings.updated',
    payload,
    subjectType: 'order_cutoff_settings',
    subjectId: 'orders',
    actorName: 'Colette Martin',
    actorType: 'staff',
  };
}

const sentence = (input: FactInput): string => renderFact(input).sentence.replace(/\s/gu, ' ');

describe('l’heure limite générale (order_cutoff_settings.updated)', () => {
  it('dit la désactivation et ce qui ferme encore une journée', () => {
    const input = updated({
      enabled: false,
      sameDayAllowed: false,
      previous: { enabled: true, sameDayAllowed: false },
    });

    expect(sentence(input)).toBe(
      'Colette Martin a désactivé l’heure limite générale de commande ; seuls l’arrêt du plan et les limites des articles ferment encore une journée',
    );
    expect(renderFact(input).detail).toEqual([]);
  });

  it('dit la réactivation', () => {
    expect(
      sentence(
        updated({
          enabled: true,
          sameDayAllowed: false,
          previous: { enabled: false, sameDayAllowed: false },
        }),
      ),
    ).toBe('Colette Martin a réactivé l’heure limite générale de commande');
  });

  it('une charge illisible garde une phrase neutre', () => {
    expect(sentence(updated({}))).toBe('Colette Martin a réglé l’heure limite de commande');
  });

  it('dit l’ouverture du jour même', () => {
    expect(
      sentence(
        updated({
          enabled: true,
          sameDayAllowed: true,
          previous: { enabled: true, sameDayAllowed: false },
        }),
      ),
    ).toBe('Colette Martin a autorisé les commandes pour le jour même');
  });
});
