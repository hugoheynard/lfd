import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type {
  StaffPermission,
  AmendCompanyMercurialePayload,
  AmendedMercurialeResponse,
  CompanyPricingCategoryView,
  PosedMercurialeView,
} from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { PromotionsService } from '../../../targeted-promotions/promotions.service';
import { CompanyPricingService } from '../company-pricing.service';
import { MercurialeAmendments } from './mercuriale-amendments';

/**
 * **Les avenants sous la grille d'une mercuriale** (`documentation/pricing/mercuriales/l-avenant-date.md`,
 * T6) : la liste, les deux gestes, et rien d'envoyé sans motif.
 */

class StubPricing {
  readonly sent: {
    companyId: string;
    mercurialeId: string;
    payload: AmendCompanyMercurialePayload;
  }[] = [];
  amend(
    companyId: string,
    mercurialeId: string,
    payload: AmendCompanyMercurialePayload,
  ): Promise<AmendedMercurialeResponse> {
    this.sent.push({ companyId, mercurialeId, payload });
    return Promise.resolve({ amendmentId: 'amd_1' });
  }
}

class StubNotify {
  readonly said: string[] = [];
  success(message: string): void {
    this.said.push(message);
  }
  error(): void {
    this.said.push('error');
  }
}

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
  lines: [
    { sku: 'VIE-001-1', productName: 'Croissant', unitPriceMillicents: 90_000, minQuantity: 1 },
  ],
  amendments: [
    {
      id: 'amd_0',
      validFrom: '2026-02-01T00:00:00.000Z',
      validTo: null,
      reason: 'Ajout',
      openedSkus: ['VIE-002-1'],
      endedSkus: [],
      createdBy: 'staff_1',
      createdByName: 'Marie Curie',
    },
  ],
};

const CAN: readonly StaffPermission[] = ['b2b_pricing:read', 'b2b_pricing:write'];

function mount(
  mercuriale: PosedMercurialeView = MERCURIALE,
  granted = CAN,
  categories: readonly CompanyPricingCategoryView[] = [],
) {
  const pricing = new StubPricing();
  TestBed.configureTestingModule({
    providers: [
      { provide: CompanyPricingService, useValue: pricing },
      { provide: NotifyService, useValue: new StubNotify() },
      { provide: PromotionsService, useValue: { list: async () => ({ promotions: [] }) } },
      { provide: PermissionsStore, useValue: { can: (p: StaffPermission) => granted.includes(p) } },
    ],
  });
  const fixture: ComponentFixture<MercurialeAmendments> =
    TestBed.createComponent(MercurialeAmendments);
  fixture.componentRef.setInput('companyId', 'co_1');
  fixture.componentRef.setInput('mercuriale', mercuriale);
  fixture.componentRef.setInput('categories', categories);
  const amended: string[] = [];
  fixture.componentInstance.amended.subscribe(() => amended.push('amended'));
  fixture.detectChanges();
  return { fixture, pricing, amended, host: fixture.nativeElement as HTMLElement };
}

describe('<app-mercuriale-amendments>', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('liste les avenants et propose les deux gestes', () => {
    const { host } = mount();

    expect(host.querySelector('[data-amendments]')?.textContent).toContain(
      '« Ajout » — Marie Curie',
    );
    expect(host.querySelector('[data-amend-price]')).not.toBeNull();
    expect(host.querySelector('[data-amend-end]')).not.toBeNull();
  });

  it('ne propose plus rien sur une mercuriale terminée, mais garde la liste', () => {
    const { host } = mount({ ...MERCURIALE, status: 'expired' });

    expect(host.querySelector('[data-amendments]')).not.toBeNull();
    expect(host.querySelector('[data-amend-price]')).toBeNull();
  });

  it('ne propose aucun geste à un lecteur sans `b2b_pricing:write`, mais garde la liste', () => {
    const { host } = mount(MERCURIALE, ['b2b_pricing:read']);

    expect(host.querySelector('[data-amendments]')).not.toBeNull();
    expect(host.querySelector('[data-amend-price]')).toBeNull();
    expect(host.querySelector('[data-amend-end]')).toBeNull();
  });

  it('change un prix : envoie l’avenant qui arrête et rouvre, puis prévient le parent', async () => {
    const { fixture, pricing, amended } = mount();
    const component = fixture.componentInstance;
    component['open']('price');
    component['sku'].set('VIE-001-1');
    component['euros'].set(0.85);
    component['reason'].set('Prix revu');

    await component['submit']();

    expect(pricing.sent).toEqual([
      {
        companyId: 'co_1',
        mercurialeId: 'merc_1',
        payload: {
          validTo: null,
          reason: 'Prix revu',
          lines: [{ sku: 'VIE-001-1', unitPriceMillicents: 85_000 }],
          endedSkus: ['VIE-001-1'],
        },
      },
    ]);
    expect(amended).toEqual(['amended']);
    expect(component['gesture']()).toBeNull();
  });

  it('n’envoie rien sans motif, et dit pourquoi', async () => {
    const { fixture, pricing } = mount();
    const component = fixture.componentInstance;
    component['open']('end');
    component['sku'].set('VIE-001-1');

    await component['submit']();
    fixture.detectChanges();

    expect(pricing.sent).toEqual([]);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-amend-refusal]')?.textContent,
    ).toContain('Le motif est obligatoire');
  });

  it('un avenant peut ne porter QUE la politique de promotions, à sa date d’effet', async () => {
    const { fixture, pricing, amended } = mount();
    const component = fixture.componentInstance;
    component['open']('policy');
    // Il part de la politique en vigueur — ici, faute d'en lire une, « Aucune ».
    expect(component['policy']()).toEqual({ mode: 'none', promotionIds: [] });
    component['policy'].set({ mode: 'selected', promotionIds: ['p_rentree'] });
    component['fromDay'].set('2026-12-01');
    component['reason'].set('Accord sur la rentrée');

    await component['submit']();

    expect(pricing.sent).toHaveLength(1);
    expect(pricing.sent[0]?.payload).toMatchObject({
      validTo: null,
      reason: 'Accord sur la rentrée',
      lines: [],
      endedSkus: [],
      promotionPolicy: { mode: 'selected', promotionIds: ['p_rentree'] },
    });
    expect(pricing.sent[0]?.payload.validFrom).toBeDefined();
    expect(amended).toEqual(['amended']);
  });

  it('refuse un avenant de politique qui ne change rien, ou un « Au choix » vide', async () => {
    const { fixture, pricing } = mount({
      ...MERCURIALE,
      promotionPolicy: { mode: 'all', promotionIds: [] },
    });
    const component = fixture.componentInstance;
    component['open']('policy');
    component['reason'].set('Rien');
    await component['submit']();
    expect(component['refusal']()).toContain('déjà la politique en vigueur');

    component['policy'].set({ mode: 'selected', promotionIds: [] });
    await component['submit']();
    expect(component['refusal']()).toContain('au moins une');
    expect(pricing.sent).toEqual([]);
  });

  it('nomme la politique qu’un avenant a ouverte', () => {
    const { fixture, host } = mount({
      ...MERCURIALE,
      amendments: [
        {
          id: 'amd_p',
          validFrom: '2026-03-01T00:00:00.000Z',
          validTo: null,
          reason: 'Rentrée',
          openedSkus: [],
          endedSkus: [],
          promotionPolicy: { mode: 'all', promotionIds: [] },
          createdBy: 'staff_1',
          createdByName: 'Marie Curie',
        },
      ],
    });
    fixture.detectChanges();
    expect(host.querySelector('[data-amendments]')?.textContent).toContain(
      'promotions : Toutes les promotions',
    );
  });

  const DISCOUNTED: PosedMercurialeView = {
    ...MERCURIALE,
    generalDiscount: {
      mode: 'all_except',
      baseBp: 3000,
      rules: [{ target: 'category', targetId: 'choco', bp: null }],
    },
  };

  it('Q1 : arrêter le prix ferme d’un article couvert dit qu’il passe à la remise', () => {
    const { fixture, host } = mount(DISCOUNTED);
    const component = fixture.componentInstance;
    component['open']('end');
    component['sku'].set('VIE-001-1');
    fixture.detectChanges();

    expect(host.querySelector('[data-falls-to-discount]')?.textContent).toContain(
      'Cet article passera à −30 % (remise générale).',
    );
  });

  it('Q1 : rien à dire sans remise générale', () => {
    const { fixture, host } = mount();
    fixture.componentInstance['open']('end');
    fixture.componentInstance['sku'].set('VIE-001-1');
    fixture.detectChanges();

    expect(host.querySelector('[data-falls-to-discount]')).toBeNull();
  });

  it('change la remise générale par avenant daté, sur sa fenêtre', async () => {
    const { fixture, pricing } = mount(DISCOUNTED);
    const component = fixture.componentInstance;
    component['open']('discount');
    expect(component['discount']()).toMatchObject({ mode: 'all_except', baseBp: 3000 });
    component['discount'].set({ mode: 'all_except', baseBp: 2000, lines: [] });
    component['toDay'].set('2027-01-31');
    component['reason'].set('Soldes de janvier');

    await component['submit']();

    expect(pricing.sent[0]?.payload).toMatchObject({
      reason: 'Soldes de janvier',
      lines: [],
      endedSkus: [],
      generalDiscount: { set: { mode: 'all_except', baseBp: 2000, rules: [] } },
    });
    expect(pricing.sent[0]?.payload.validTo).not.toBeNull();
  });

  it('« Arrêter la remise » envoie `{ set: null }`', async () => {
    const { fixture, pricing } = mount(DISCOUNTED);
    const component = fixture.componentInstance;
    component['open']('discount');
    component['stopDiscount']();
    component['reason'].set('Fin de l’accord');

    await component['submit']();

    expect(pricing.sent[0]?.payload.generalDiscount).toEqual({ set: null });
  });

  it('refuse d’arrêter une remise qui n’existe pas', async () => {
    const { fixture, pricing } = mount();
    const component = fixture.componentInstance;
    component['open']('discount');
    component['reason'].set('Rien');

    await component['submit']();

    expect(pricing.sent).toEqual([]);
    expect(component['refusal']()).toContain('rien à arrêter');
  });
});
