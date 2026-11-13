import { describe, expect, it } from 'vitest';

import type { CockpitHandoversView } from '@lfd/contracts';

import { remainingHandovers, todayHandovers } from '../cockpit-bar/today-handovers';

const VIEW: CockpitHandoversView = {
  day: '2026-09-12',
  pickup: { expected: 2, done: 1 },
  delivery: { expected: 1, done: 0 },
};

describe('todayHandovers', () => {
  it('reprend les deux voies comptées par le serveur', () => {
    expect(todayHandovers(VIEW)).toEqual({
      pickup: { expected: 2, done: 1 },
      delivery: { expected: 1, done: 0 },
    });
  });

  it('rend null quand la lecture a échoué', () => {
    expect(todayHandovers(null)).toBeNull();
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
