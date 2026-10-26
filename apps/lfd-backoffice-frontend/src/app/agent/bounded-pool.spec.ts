import { describe, expect, it } from 'vitest';

import { mapWithConcurrency } from './bounded-pool';

describe('mapWithConcurrency', () => {
  it('ne dépasse jamais la borne et rend dans l’ordre', async () => {
    let inFlight = 0;
    let peak = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10 - n));
      inFlight -= 1;
      return n * 2;
    });
    expect(peak).toBe(4);
    expect(result).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
  });

  it('rend une liste vide sans rien appeler', async () => {
    expect(await mapWithConcurrency([], 4, () => Promise.reject(new Error('x')))).toEqual([]);
  });
});
