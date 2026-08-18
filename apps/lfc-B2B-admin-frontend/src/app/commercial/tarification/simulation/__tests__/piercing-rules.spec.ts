import { describe, expect, it } from 'vitest';
import type { PriceRuleView, PricingBoardView } from '@lfd/contracts';

import { piercingRuleLabels } from '../piercing-rules';

function rule(over: Partial<PriceRuleView>): PriceRuleView {
  return {
    id: 'rule_1',
    stage: 'promotion',
    scope: { type: 'global', id: null },
    audience: { type: 'all', id: null },
    minQuantity: null,
    effect: { nature: 'alter', direction: 'decrease', mode: 'percent', value: 1_000 },
    label: 'Rentrée',
    validFrom: '2026-09-01T00:00:00.000Z',
    validTo: null,
    status: 'active',
    stacksOverMercuriale: false,
    createdBy: 'staff',
    createdAt: '2026-08-01T00:00:00.000Z',
    pausedAt: null,
    pausedBy: null,
    archivedAt: null,
    archivedBy: null,
    archiveReason: null,
    ...over,
  };
}

function board(rules: readonly PriceRuleView[]): PricingBoardView {
  return {
    canonicalHistoryStartsAt: null,
    globalRules: rules,
    globalFloor: null,
    categories: [],
  } as unknown as PricingBoardView;
}

describe('piercingRuleLabels', () => {
  it('ne retient que les règles qui franchissent le scellement', () => {
    expect(piercingRuleLabels(board([rule({})]))).toEqual([]);
    expect(piercingRuleLabels(board([rule({ stacksOverMercuriale: true })]))).toEqual(['Rentrée']);
  });

  it('ignore celle qui est en pause — elle n’agit pas', () => {
    const paused = rule({ stacksOverMercuriale: true, status: 'paused' });
    expect(piercingRuleLabels(board([paused]))).toEqual([]);
  });

  it('reste vide sans tableau chargé', () => {
    expect(piercingRuleLabels(null)).toEqual([]);
  });
});
