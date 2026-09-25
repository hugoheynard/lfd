import { describe, expect, it } from 'vitest';

import { runBulk } from '../bulk-pose';

describe('runBulk', () => {
  it('rend les posées et les refusées, avec la raison, dans l’ordre de la sélection', async () => {
    const outcome = await runBulk(
      ['a', 'b', 'c', 'd'],
      (item) =>
        item === 'b' || item === 'd' ? Promise.reject(new Error(`non ${item}`)) : Promise.resolve(),
      (error) => (error instanceof Error ? error.message : '?'),
      2,
    );

    expect(outcome.posed).toEqual(['a', 'c']);
    expect(outcome.refused).toEqual([
      { item: 'b', reason: 'non b' },
      { item: 'd', reason: 'non d' },
    ]);
  });

  it('ne dépasse jamais le nombre d’appels simultanés', async () => {
    let inFlight = 0;
    let peak = 0;
    await runBulk(
      Array.from({ length: 10 }, (_, index) => index),
      async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await Promise.resolve();
        inFlight -= 1;
      },
      () => '',
      3,
    );

    expect(peak).toBe(3);
  });
});
