import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { PriceTemplatesService } from '../../../commercial/tarification/templates.service';
import { PromotionsService } from '../../../targeted-promotions/promotions.service';
import { CompanyPricingService } from '../company-pricing.service';
import { NO_PROMOTION_POLICY, type PromotionPolicyForm } from '../promotion-policy';
import type { DraftPrices } from '../draft-prices';
import type { GeneralDiscountForm } from '../general-discount-form';
import { MercurialeComposer } from './mercuriale-composer';

/** Le service doublé : retient les clés d'intention, refuse tant qu'on le dit. */
class KeyedPricing {
  readonly keys: string[] = [];
  refuse = true;
  pose(_companyId: string, _payload: unknown, intentKey: string) {
    this.keys.push(intentKey);
    return this.refuse
      ? Promise.reject(new Error('indisponible'))
      : Promise.resolve({ affectedRules: 1 });
  }
}

/** La pose n'est offerte qu'avec un nom, deux dates et au moins un prix. */
function mount(
  label: string,
  from: string,
  to: string,
  draft: DraftPrices,
  policy: PromotionPolicyForm = NO_PROMOTION_POLICY,
  discount: GeneralDiscountForm | null = null,
  pricing: object = {},
) {
  TestBed.configureTestingModule({
    providers: [
      { provide: CompanyPricingService, useValue: pricing },
      { provide: PriceTemplatesService, useValue: {} },
      { provide: PromotionsService, useValue: { list: async () => ({ promotions: [] }) } },
    ],
  });
  const fixture = TestBed.createComponent(MercurialeComposer);
  fixture.componentRef.setInput('companyId', 'co_1');
  fixture.componentRef.setInput('categories', []);
  fixture.componentRef.setInput('label', label);
  fixture.componentRef.setInput('validFrom', from);
  fixture.componentRef.setInput('validTo', to);
  fixture.componentRef.setInput('draft', draft);
  fixture.componentRef.setInput('promotionPolicy', policy);
  fixture.componentRef.setInput('generalDiscount', discount);
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

  it('pose sans date de fin : la mercuriale court jusqu’à ce qu’on la close', () => {
    const composer = mount('Mercuriale 2027', '2027-01-01', '', new Map([['VIE-001-1', '0.90']]));
    expect(composer['canPose']()).toBe(true);
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

  it('un « Seulement celles choisies » vide ne se pose pas', () => {
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

  it('D5 : pose une mercuriale qui ne porte qu’une remise générale', () => {
    const composer = mount('Mercuriale 2027', '2027-01-01', '', new Map(), NO_PROMOTION_POLICY, {
      mode: 'all_except',
      baseBp: 1500,
      lines: [],
    });
    expect(composer['canPose']()).toBe(true);
  });

  it('ne pose pas une remise incomplète', () => {
    const composer = mount(
      'Mercuriale 2027',
      '2027-01-01',
      '',
      new Map([['VIE-001-1', '0.90']]),
      NO_PROMOTION_POLICY,
      { mode: 'all_except', baseBp: null, lines: [] },
    );
    expect(composer['canPose']()).toBe(false);
    expect(composer['discountProblem']()).toContain('taux de base');
  });

  it('renvoie la même clé d’intention au réessai de la même pose, et une neuve après un succès', async () => {
    const pricing = new KeyedPricing();
    const composer = mount(
      'Mercuriale 2027',
      '2027-01-01',
      '2027-12-31',
      new Map([['VIE-001-1', '0.90']]),
      NO_PROMOTION_POLICY,
      null,
      pricing,
    );
    await composer['pose']();
    pricing.refuse = false;
    await composer['pose']();
    await composer['pose']();
    expect(pricing.keys).toHaveLength(3);
    expect(pricing.keys[1]).toBe(pricing.keys[0]);
    expect(pricing.keys[2]).not.toBe(pricing.keys[1]);
  });
});
