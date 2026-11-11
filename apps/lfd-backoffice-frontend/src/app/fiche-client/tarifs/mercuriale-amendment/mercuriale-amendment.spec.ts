import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type {
  AmendCompanyMercurialePayload,
  CompanyPricingCategoryView,
  MercurialeAmendmentPreviewView,
  PosedMercurialeView,
  PricingItemView,
} from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { NotifyService } from '../../../notify.service';
import { PromotionsService } from '../../../targeted-promotions/promotions.service';
import { CompanyPricingService } from '../company-pricing.service';
import { NO_PROMOTION_POLICY } from '../promotion-policy';
import { MercurialeAmendment } from './mercuriale-amendment';

/**
 * **L'avenant dans la table** (`l-avenant-date.md`, § 8.4) : l'aperçu
 * à l'ouverture, les étapes, le récapitulatif, F1, le corps envoyé et le 409
 * de concurrence.
 */

function item(sku: string, canonicalMillicents: number): PricingItemView {
  return {
    sku,
    name: `Nom ${sku}`,
    canonicalMillicents,
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
    finalMillicents: canonicalMillicents,
    elasticity: null,
    negotiationRoom: null,
  };
}

const CATEGORIES: readonly CompanyPricingCategoryView[] = [
  {
    id: 'vien',
    name: 'Viennoiserie',
    family: { id: 'vien', name: 'Viennoiserie', position: 0, path: ['vien'] },
    items: [item('CRO', 150_000), item('BRI', 200_000)],
  },
];

const MERCURIALE: PosedMercurialeView = {
  id: 'merc_1',
  label: 'Mercuriale 2027',
  validFrom: '2026-01-01T00:00:00.000Z',
  validTo: null,
  status: 'active',
  ruleCount: 1,
  skuCount: 1,
  createdBy: 'staff_1',
  createdByName: null,
  lines: [{ sku: 'CRO', productName: 'Croissant', unitPriceMillicents: 130_000, minQuantity: 1 }],
  amendments: [],
};

function preview(refusal = false): MercurialeAmendmentPreviewView {
  return {
    at: '2026-11-11T10:00:00.000Z',
    basedOnAmendmentId: 'amd_9',
    state: {
      firm: [{ sku: 'CRO', tiers: [{ minQuantity: 1, unitPriceMillicents: 130_000 }] }],
      generalDiscount: null,
      promotionPolicy: NO_PROMOTION_POLICY,
    },
    items: [
      {
        sku: 'CRO',
        beforeMillicents: 130_000,
        afterMillicents: 120_000,
        floored: false,
        source: 'firm',
      },
      {
        sku: 'BRI',
        beforeMillicents: 200_000,
        afterMillicents: 200_000,
        floored: false,
        source: 'chain',
      },
    ],
    refusals: refusal ? [{ code: 'x', sku: 'CRO', message: 'Refusé.' }] : [],
  };
}

class StubPricing {
  readonly previews: AmendCompanyMercurialePayload[] = [];
  readonly sent: AmendCompanyMercurialePayload[] = [];
  refuse = false;
  meanwhile = false;
  previewAmendment(_c: string, _m: string, body: AmendCompanyMercurialePayload) {
    this.previews.push(body);
    return Promise.resolve(preview(this.refuse));
  }
  amend(_c: string, _m: string, body: AmendCompanyMercurialePayload) {
    this.sent.push(body);
    if (this.meanwhile) {
      return Promise.reject({
        error: { code: 'pricing.mercuriale.amendment.amended_meanwhile', message: 'x' },
        status: 409,
      });
    }
    return Promise.resolve({ amendmentId: 'amd_10' });
  }
}

async function settle(fixture: ComponentFixture<MercurialeAmendment>): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve));
  fixture.detectChanges();
  await fixture.whenStable();
}

async function mount(mercuriale: PosedMercurialeView = MERCURIALE) {
  const pricing = new StubPricing();
  TestBed.configureTestingModule({
    providers: [
      { provide: CompanyPricingService, useValue: pricing },
      { provide: NotifyService, useValue: { success: () => undefined } },
      { provide: PromotionsService, useValue: { list: async () => ({ promotions: [] }) } },
    ],
  });
  const fixture = TestBed.createComponent(MercurialeAmendment);
  fixture.componentRef.setInput('companyId', 'co_1');
  fixture.componentRef.setInput('mercuriale', mercuriale);
  fixture.componentRef.setInput('categories', CATEGORIES);
  const saved: string[] = [];
  fixture.componentInstance.saved.subscribe(() => saved.push('saved'));
  fixture.detectChanges();
  await settle(fixture);
  const editor = fixture.componentInstance;
  const host = fixture.nativeElement as HTMLElement;
  return { fixture, editor, pricing, saved, host };
}

describe('<app-mercuriale-amendment>', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('ouvre sur l’état en vigueur, sans aucun changement, à l’étape 1', async () => {
    const { editor, pricing, host } = await mount();
    expect(pricing.previews).toHaveLength(1);
    expect(pricing.previews[0]).not.toHaveProperty('validFrom');
    expect(editor['changes']()).toBe(0);
    expect(host.querySelector('[aria-current="step"]')?.textContent).toContain('Modifier');
  });

  it('« Vérifier » sans changement dit que l’avenant ne change rien et reste à l’étape 1', async () => {
    const { fixture, editor, host } = await mount();
    await editor['verify']();
    fixture.detectChanges();
    expect(editor['step']()).toBe(1);
    expect(host.querySelector('[data-amend-refusal]')?.textContent).toContain('ne change rien');
  });

  it('un prix changé : aperçu à la vérification, récapitulatif en phrases, F1 interdit la fin', async () => {
    const { fixture, editor, pricing, host } = await mount();
    editor['setPrice']({ sku: 'CRO', euros: 1.2 });
    expect(editor['changes']()).toBe(1);
    await editor['verify']();
    await settle(fixture);
    expect(pricing.previews[1]).toMatchObject({ endedSkus: ['CRO'], lines: [{ sku: 'CRO' }] });
    expect(editor['step']()).toBe(2);
    expect(host.querySelector('[data-amend-recap]')?.textContent).toContain('Nom CRO : prix ferme');
    editor['toDating']();
    fixture.detectChanges();
    expect(host.querySelector('[data-amend-no-end]')).not.toBeNull();
    expect(host.querySelector('[data-amend-to]')).toBeNull();
  });

  it('un refus de l’aperçu empêche de continuer', async () => {
    const { fixture, editor, pricing, host } = await mount();
    pricing.refuse = true;
    editor['setPrice']({ sku: 'BRI', euros: 1.8 });
    await editor['verify']();
    await settle(fixture);
    expect(host.querySelector<HTMLButtonElement>('[data-amend-continue]')?.disabled).toBe(true);
  });

  it('enregistre un seul avenant, « maintenant » sans `validFrom`, avec le dernier avenant vu', async () => {
    const { fixture, editor, pricing, saved } = await mount();
    editor['setPrice']({ sku: 'BRI', euros: 1.8 });
    await editor['verify']();
    editor['toDating']();
    editor['reason'].set('Renégociation');
    await editor['save']();
    await settle(fixture);
    expect(pricing.sent).toHaveLength(1);
    expect(pricing.sent[0]).not.toHaveProperty('validFrom');
    expect(pricing.sent[0]).toMatchObject({
      lines: [{ sku: 'BRI', unitPriceMillicents: 180_000 }],
      basedOnAmendmentId: 'amd_9',
      reason: 'Renégociation',
    });
    expect(saved).toEqual(['saved']);
  });

  it('refuse d’enregistrer sans motif', async () => {
    const { editor, pricing } = await mount();
    editor['setPrice']({ sku: 'BRI', euros: 1.8 });
    await editor['save']();
    expect(pricing.sent).toHaveLength(0);
    expect(editor['refusal']()).toContain('motif');
  });

  it('409 : propose de recharger, qui relance l’aperçu et revient à la vérification', async () => {
    const { fixture, editor, pricing, host } = await mount();
    pricing.meanwhile = true;
    editor['setPrice']({ sku: 'BRI', euros: 1.8 });
    await editor['verify']();
    editor['toDating']();
    editor['reason'].set('Renégociation');
    await editor['save']();
    await settle(fixture);
    expect(host.querySelector('[data-amend-meanwhile]')).not.toBeNull();
    const before = pricing.previews.length;
    await editor['reload']();
    expect(pricing.previews.length).toBe(before + 1);
    expect(editor['step']()).toBe(2);
  });

  it('une mercuriale à venir s’ouvre à son premier jour, et la table dit « Au … »', async () => {
    const { editor, pricing, host } = await mount({
      ...MERCURIALE,
      validFrom: '2099-11-09T23:00:00.000Z',
    });
    expect(pricing.previews[0]).toMatchObject({ validFrom: '2099-11-09T23:00:00.000Z' });
    expect(editor['fromDay']()).toBe('2099-11-10');
    expect(host.querySelector('[data-amend-effect]')?.textContent).toContain('10/11/2099');
    expect(editor['beforeLabel']()).toBe('Au 10/11/2099');
  });

  it('un prix plus cher qu’aujourd’hui se dit dans la table', async () => {
    const { fixture, editor, host } = await mount();
    editor['setPrice']({ sku: 'CRO', euros: 1.5 });
    fixture.detectChanges();
    expect(host.querySelector('[data-dearer]')?.textContent).toContain('plus cher');
    expect(editor['recap']()?.warnings.join(' ')).toContain('seront plus chers');
  });
});
