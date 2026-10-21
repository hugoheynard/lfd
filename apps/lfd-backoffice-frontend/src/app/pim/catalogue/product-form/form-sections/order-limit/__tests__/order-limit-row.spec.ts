import { describe, expect, it } from 'vitest';

import type { OrderTimeLimitView } from '@lfd/pim-contracts';

import { limitApplies, productRule } from '../order-limit-row';

function rule(
  type: OrderTimeLimitView['scope']['type'],
  id: string | null,
  over: Partial<OrderTimeLimitView> = {},
): OrderTimeLimitView {
  return {
    id: `${type}:${id ?? ''}`,
    scope: { type, id },
    scopeLabel: null,
    daysBefore: 1,
    time: '18:00',
    graceMinutes: null,
    ...over,
  };
}

describe('productRule', () => {
  it('trouve la limite posée sur ce produit', () => {
    expect(productRule([rule('product', 'p1')], 'p1')?.id).toBe('product:p1');
  });

  /** Depuis le 2026-10-21, seule la portée produit compte. */
  it('ignore une ligne globale, de famille ou de déclinaison', () => {
    const residual = [rule('global', null), rule('category', 'p1'), rule('variant', 'p1')];
    expect(productRule(residual, 'p1')).toBeNull();
  });

  it('rend null pour un produit sans limite', () => {
    expect(productRule([rule('product', 'p2')], 'p1')).toBeNull();
  });
});

describe('limitApplies', () => {
  it('applique une limite qui dit le délai ET l’heure', () => {
    expect(limitApplies(rule('product', 'p1'))).toBe(true);
  });

  it("n'applique rien sans heure, ni sans délai, ni sans règle", () => {
    expect(limitApplies(rule('product', 'p1', { time: null }))).toBe(false);
    expect(limitApplies(rule('product', 'p1', { daysBefore: null }))).toBe(false);
    expect(limitApplies(null)).toBe(false);
  });
});
