import { describe, expect, it } from 'vitest';

import type { HandoverQueueEntryView, HandoverQueueState, HandoverQueueView } from '@lfd/contracts';

import { remainingHandovers, todayHandovers } from '../cockpit-bar/today-handovers';

function entry(
  id: string,
  fulfillmentMethod: 'pickup' | 'delivery',
  state: HandoverQueueState,
): HandoverQueueEntryView {
  return {
    orderId: id,
    reference: `CMD-${id}`,
    customerLabel: 'Boulangerie Marin',
    tradeName: null,
    pickupLabel: fulfillmentMethod === 'pickup' ? 'Labo' : null,
    fulfillmentMethod,
    window: null,
    totalUnits: 12,
    placedAt: '2026-09-11T08:00:00.000Z',
    state,
    handedOverAt: state === 'handed_over' ? '2026-09-12T09:00:00.000Z' : null,
    handedOverVia: state === 'handed_over' ? 'scan' : null,
    readyAt: null,
  };
}

function queue(entries: readonly HandoverQueueEntryView[]): HandoverQueueView {
  return { day: '2026-09-12', entries };
}

describe('todayHandovers', () => {
  it('sépare les deux voies et compte ce qui est déjà remis', () => {
    const view = queue([
      entry('1', 'pickup', 'expected'),
      entry('2', 'pickup', 'handed_over'),
      entry('3', 'delivery', 'ready'),
    ]);

    expect(todayHandovers(view)).toEqual({
      pickup: { expected: 2, done: 1 },
      delivery: { expected: 1, done: 0 },
    });
  });

  /**
   * Régression : la file REND les annulées — un client qui se présente avec une
   * commande annulée doit être trouvé à l'écran. Les compter ici gonflerait le
   * reste-à-faire d'un travail qui n'existe pas.
   */
  it('exclut les commandes annulées', () => {
    const view = queue([entry('1', 'pickup', 'cancelled'), entry('2', 'delivery', 'cancelled')]);

    expect(todayHandovers(view)).toEqual({
      pickup: { expected: 0, done: 0 },
      delivery: { expected: 0, done: 0 },
    });
  });

  it('rend null quand la lecture a échoué', () => {
    expect(todayHandovers(null)).toBeNull();
  });

  it('rend deux voies à zéro sur une journée vide', () => {
    expect(todayHandovers(queue([]))).toEqual({
      pickup: { expected: 0, done: 0 },
      delivery: { expected: 0, done: 0 },
    });
  });
});

describe('remainingHandovers', () => {
  it('additionne ce qui reste sur les deux voies', () => {
    expect(
      remainingHandovers({ pickup: { expected: 5, done: 2 }, delivery: { expected: 3, done: 3 } }),
    ).toBe(3);
  });

  it('vaut zéro quand tout est remis', () => {
    expect(
      remainingHandovers({ pickup: { expected: 2, done: 2 }, delivery: { expected: 0, done: 0 } }),
    ).toBe(0);
  });
});
