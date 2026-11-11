import { TestBed } from '@angular/core/testing';
import type { CompanyPricingCategoryView } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import type { GeneralDiscountForm } from '../general-discount';
import { GeneralDiscountPicker } from './general-discount-picker';

const CATEGORIES: CompanyPricingCategoryView[] = [
  {
    id: 'pain',
    name: 'Pains',
    family: { id: 'pain', name: 'Pains', position: 1, path: ['pain'] },
    items: ['BAG', 'PAV'].map((sku) => ({
      sku,
      name: sku,
      canonicalMillicents: 100_000,
      ownFloor: null,
      volumeTiers: null,
      effectiveFloor: null,
      rules: [],
      supersededRuleIds: [],
      sealedByRuleId: null,
      sealedRuleIds: [],
      steps: [],
      floored: false,
      clampedToZero: false,
      finalMillicents: 100_000,
      elasticity: null,
      negotiationRoom: null,
    })),
  },
];

function mount(discount: GeneralDiscountForm | null, firm: readonly string[] = []) {
  const fixture = TestBed.createComponent(GeneralDiscountPicker);
  fixture.componentRef.setInput('discount', discount);
  fixture.componentRef.setInput('categories', CATEGORIES);
  fixture.componentRef.setInput('firmSkus', new Set(firm));
  fixture.detectChanges();
  return fixture;
}

describe('<app-general-discount-picker>', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('l’interrupteur ouvre une remise « tout sauf » à compléter, et la referme', () => {
    const fixture = mount(null);
    const picker = fixture.componentInstance;
    picker['toggle'](true);
    expect(picker.discount()).toEqual({ mode: 'all_except', baseBp: null, lines: [] });
    expect(picker['subtitle']()).toBe('À compléter');
    picker['toggle'](false);
    expect(picker.discount()).toBeNull();
  });

  it('compte les articles concernés, et ceux que leur prix ferme garde', () => {
    const fixture = mount({ mode: 'all_except', baseBp: 3000, lines: [] }, ['BAG']);
    expect(fixture.componentInstance['subtitle']()).toBe(
      '2 article(s) concerné(s) sur 2 · 1 gardent leur prix ferme',
    );
  });

  it('ajoute une famille, lui donne un taux, puis la retire', () => {
    const fixture = mount({ mode: 'only', baseBp: null, lines: [] });
    const picker = fixture.componentInstance;
    picker['addFamily']('pain');
    const [line] = picker.discount()!.lines;
    expect(line).toMatchObject({ target: 'category', targetId: 'pain', excluded: false });
    picker['setRate'](line!, 40);
    expect(picker.discount()!.lines[0]?.bp).toBe(4000);
    picker['remove'](picker.discount()!.lines[0]!);
    expect(picker.discount()!.lines).toEqual([]);
  });
});
