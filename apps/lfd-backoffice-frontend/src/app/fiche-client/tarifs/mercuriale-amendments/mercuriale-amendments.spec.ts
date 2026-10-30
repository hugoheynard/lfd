import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type {
  StaffPermission,
  AmendCompanyMercurialePayload,
  AmendedMercurialeResponse,
  PosedMercurialeView,
} from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { CompanyPricingService } from '../company-pricing.service';
import { MercurialeAmendments } from './mercuriale-amendments';

/**
 * **Les avenants sous la grille d'une mercuriale** (`plan-tarif-date-sur-une-reference.md`,
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

function mount(mercuriale: PosedMercurialeView = MERCURIALE, granted = CAN) {
  const pricing = new StubPricing();
  TestBed.configureTestingModule({
    providers: [
      { provide: CompanyPricingService, useValue: pricing },
      { provide: NotifyService, useValue: new StubNotify() },
      { provide: PermissionsStore, useValue: { can: (p: StaffPermission) => granted.includes(p) } },
    ],
  });
  const fixture: ComponentFixture<MercurialeAmendments> =
    TestBed.createComponent(MercurialeAmendments);
  fixture.componentRef.setInput('companyId', 'co_1');
  fixture.componentRef.setInput('mercuriale', mercuriale);
  fixture.componentRef.setInput('categories', []);
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
});
