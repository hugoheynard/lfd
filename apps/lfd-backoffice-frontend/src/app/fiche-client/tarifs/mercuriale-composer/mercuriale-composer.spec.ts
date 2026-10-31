import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { PriceTemplatesService } from '../../../commercial/tarification/templates.service';
import { PromotionsService } from '../../../targeted-promotions/promotions.service';
import { CompanyPricingService } from '../company-pricing.service';
import { NO_PROMOTION_POLICY, type PromotionPolicyForm } from '../promotion-policy';
import type { DraftPrices } from '../draft-prices';
import { MercurialeComposer } from './mercuriale-composer';

/** La pose n'est offerte qu'avec un nom, deux dates et au moins un prix. */
function mount(
  label: string,
  from: string,
  to: string,
  draft: DraftPrices,
  policy: PromotionPolicyForm = NO_PROMOTION_POLICY,
) {
  TestBed.configureTestingModule({
    providers: [
      { provide: CompanyPricingService, useValue: {} },
      { provide: PriceTemplatesService, useValue: {} },
      { provide: PromotionsService, useValue: { list: async () => ({ promotions: [] }) } },
    ],
  });
  const fixture = TestBed.createComponent(MercurialeComposer);
  fixture.componentRef.setInput('companyId', 'co_1');
  fixture.componentRef.setInput('categories', []);
  fixture.componentRef.setInput('blocked', false);
  fixture.componentRef.setInput('label', label);
  fixture.componentRef.setInput('validFrom', from);
  fixture.componentRef.setInput('validTo', to);
  fixture.componentRef.setInput('draft', draft);
  fixture.componentRef.setInput('promotionPolicy', policy);
  fixture.detectChanges();
  return fixture.componentInstance;
}

describe('<app-mercuriale-composer>', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('refuse de poser une grille vide', () => {
    const composer = mount('Mercuriale 2027', '2027-01-01', '2027-12-31', new Map());
    expect(composer['canPose']()).toBe(false);
  });

  it('refuse de poser sans nom', () => {
    const composer = mount('  ', '2027-01-01', '2027-12-31', new Map([['VIE-001-1', '0.90']]));
    expect(composer['canPose']()).toBe(false);
  });

  it('pose un nom, deux dates et un prix', () => {
    const composer = mount(
      'Mercuriale 2027',
      '2027-01-01',
      '2027-12-31',
      new Map([['VIE-001-1', '0.90']]),
    );
    expect(composer['canPose']()).toBe(true);
  });

  it('montre « Promotions pour ce client » ; un « Au choix » vide ne se pose pas', () => {
    const composer = mount(
      'Mercuriale 2027',
      '2027-01-01',
      '2027-12-31',
      new Map([['VIE-001-1', '0.90']]),
      { mode: 'selected', promotionIds: [] },
    );
    expect(composer['canPose']()).toBe(false);
    expect(composer['policyProblem']()).toContain('au moins une');
  });
});
