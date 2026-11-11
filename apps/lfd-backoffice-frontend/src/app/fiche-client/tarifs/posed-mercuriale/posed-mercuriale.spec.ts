import { TestBed } from '@angular/core/testing';
import type { PosedMercurialeStatus, PosedMercurialeView, StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { PromotionsService } from '../../../targeted-promotions/promotions.service';
import { CompanyPricingService } from '../company-pricing.service';
import { PosedMercuriale } from './posed-mercuriale';

/**
 * « Corriger les dates » ne s'offre que sur une mercuriale **à venir**, et
 * avec le droit d'écriture : une mercuriale commencée garde ses dates.
 */

const mercuriale = (status: PosedMercurialeStatus): PosedMercurialeView => ({
  id: 'merc_1',
  label: 'Mercuriale 2026',
  validFrom: '2027-01-01T00:00:00.000Z',
  validTo: null,
  status,
  ruleCount: 0,
  skuCount: 0,
  createdBy: 'staff_1',
  createdByName: 'Marie Curie',
  lines: [],
});

async function render(
  status: PosedMercurialeStatus,
  granted: readonly StaffPermission[],
): Promise<HTMLElement> {
  TestBed.configureTestingModule({
    imports: [PosedMercuriale],
    providers: [
      { provide: CompanyPricingService, useValue: {} },
      { provide: PromotionsService, useValue: { list: () => Promise.resolve({ promotions: [] }) } },
      { provide: PermissionsStore, useValue: { can: (p: StaffPermission) => granted.includes(p) } },
    ],
  });
  const fixture = TestBed.createComponent(PosedMercuriale);
  fixture.componentRef.setInput('companyId', 'co_1');
  fixture.componentRef.setInput('mercuriale', mercuriale(status));
  fixture.componentRef.setInput('categories', []);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

const WRITE: readonly StaffPermission[] = ['b2b_pricing:read', 'b2b_pricing:write'];

describe('PosedMercuriale — « Corriger les dates »', () => {
  it('s’offre sur une mercuriale à venir, avec le droit d’écriture', async () => {
    const element = await render('scheduled', WRITE);
    expect(element.querySelector('[data-correct-window]')?.textContent).toContain(
      'Corriger les dates',
    );
  });

  it.each(['active', 'suspended', 'expired'] as const)('ne s’offre pas : %s', async (status) => {
    const element = await render(status, WRITE);
    expect(element.querySelector('[data-correct-window]')).toBeNull();
  });

  it('ne s’offre pas à un lecteur seul', async () => {
    const element = await render('scheduled', ['b2b_pricing:read']);
    expect(element.querySelector('[data-correct-window]')).toBeNull();
  });
});
