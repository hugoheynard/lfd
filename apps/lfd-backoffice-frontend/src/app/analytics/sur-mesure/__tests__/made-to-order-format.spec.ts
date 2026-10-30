import { describe, expect, it } from 'vitest';

import {
  currentMonthPeriod,
  monthLabel,
  monthWindowOf,
  quantityLabel,
  shareLabel,
} from '../made-to-order-format';

describe('made-to-order-format', () => {
  it('nomme un mois en français', () => {
    expect(monthLabel('2026-01')).toBe('janvier 2026');
  });

  it('dit une part en pourcentage, et un tiret sur un mois vide', () => {
    expect(shareLabel(0.125)).toMatch(/^12,5\s%$/u);
    expect(shareLabel(null)).toBe('—');
  });

  it('dit des pièces ou des grammes', () => {
    expect(quantityLabel({ quantity: 1, saleUnit: 'piece' })).toBe('1 pièce');
    expect(quantityLabel({ quantity: 3, saleUnit: 'piece' })).toBe('3 pièces');
    expect(quantityLabel({ quantity: 1500, saleUnit: 'weight' })).toMatch(/^1\s500 g$/u);
  });

  it('ne reconnaît que les fenêtres proposées', () => {
    expect(monthWindowOf('24')).toBe(24);
    expect(monthWindowOf('7')).toBeNull();
  });

  it('ouvre au premier jour du mois', () => {
    expect(currentMonthPeriod('2026-10-30')).toEqual({ from: '2026-10-01', to: '2026-10-30' });
  });
});
