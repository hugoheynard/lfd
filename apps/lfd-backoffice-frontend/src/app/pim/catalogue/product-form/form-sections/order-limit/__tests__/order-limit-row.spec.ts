import { describe, expect, it } from 'vitest';

import type { EffectiveOrderTimeLimitView, OrderTimeLimitView } from '@lfd/pim-contracts';

import { effectivePhrase, familyRules, limitApplies, productRule } from '../order-limit-row';

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
    staffMayExceed: false,
    archived: false,
    excludedProductIds: [],
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

function view(over: Partial<EffectiveOrderTimeLimitView> = {}): EffectiveOrderTimeLimitView {
  return {
    productId: 'p1',
    lineage: [
      { id: 'f1', label: 'Gâteaux' },
      { id: 'f0', label: 'Pâtisserie' },
    ],
    rules: [],
    explained: null,
    ...over,
  };
}

describe('familyRules', () => {
  it('ne garde que les limites de famille, la plus proche d’abord', () => {
    const rules = familyRules(
      view({
        rules: [
          { rule: rule('category', 'f0'), excludesProduct: false },
          { rule: rule('product', 'p1'), excludesProduct: false },
          { rule: rule('category', 'f1'), excludesProduct: true },
        ],
      }),
    );
    expect(rules.map((entry) => entry.rule.scope.id)).toEqual(['f1', 'f0']);
  });
});

describe('effectivePhrase', () => {
  it('nomme la famille d’où vient la limite', () => {
    expect(
      effectivePhrase(
        view({
          explained: {
            limit: { daysBefore: 2, time: '12:00', graceMinutes: 0, staffMayExceed: false },
            from: { type: 'category', id: 'f1' },
          },
        }),
      ),
    ).toBe("L'avant-veille, 12:00 — famille Gâteaux");
  });

  it('rend null sans limite', () => {
    expect(effectivePhrase(view())).toBeNull();
  });
});
