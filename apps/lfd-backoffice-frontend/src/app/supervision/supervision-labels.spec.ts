import { describe, expect, it } from 'vitest';

import type { LateOrder } from '@lfd/contracts';

import { hourLabel, ruleLabel, stageLabel, windowLabel } from './supervision-labels';

const BASE: LateOrder = {
  orderId: 'o',
  reference: 'R',
  customerName: null,
  fulfillmentMethod: 'pickup',
  window: { start: '07:00', end: '08:30', source: 'override' },
  stage: 'placed',
  rule: 'not_handed_over_after_window',
};

describe('les mots de la Supervision', () => {
  it('écrit une heure comme on la dit', () => {
    expect(hourLabel('07:00')).toBe('7 h');
    expect(hourLabel('08:30')).toBe('8 h 30');
  });

  it('nomme le dernier geste selon l’acheminement', () => {
    expect(stageLabel('handed_over', 'pickup')).toBe('Retirée');
    expect(stageLabel('handed_over', 'delivery')).toBe('Livrée');
  });

  it('écrit chaque règle, créneau sans début compris', () => {
    expect(ruleLabel(BASE)).toBe('Créneau 7 h–8 h 30 dépassé, pas retirée');
    expect(ruleLabel({ ...BASE, fulfillmentMethod: 'delivery' })).toBe(
      'Créneau 7 h–8 h 30 dépassé, pas livrée',
    );
    expect(ruleLabel({ ...BASE, window: { ...BASE.window, start: null } })).toBe(
      "Créneau jusqu'à 8 h 30 dépassé, pas retirée",
    );
    expect(ruleLabel({ ...BASE, rule: 'not_ready_before_window' })).toBe(
      'Pas prête, créneau à 7 h',
    );
    expect(
      ruleLabel({
        ...BASE,
        rule: 'not_ready_before_window',
        window: { ...BASE.window, start: null },
      }),
    ).toBe('Pas prête, créneau à 8 h 30');
  });

  it('ne présente pas une heure d’ouverture comme une promesse', () => {
    expect(windowLabel({ ...BASE.window, source: 'default' })).toBe("heure d'ouverture");
    expect(windowLabel(null)).toBe('sans créneau');
    expect(windowLabel(BASE.window)).toBe('7 h–8 h 30');
  });
});
