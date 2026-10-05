import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CompanyHierarchyView, StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { AdminCompanyHierarchyService } from '../../comptes-clients/admin-company-hierarchy.service';
import { PricingFollow } from './pricing-follow';

const ALONE: CompanyHierarchyView = {
  parent: null,
  subAccounts: [],
  follows: [],
  groupWithoutDelivery: false,
};

async function boot(
  answer: () => Promise<CompanyHierarchyView | undefined>,
): Promise<ComponentFixture<PricingFollow>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: PermissionsStore, useValue: { can: (_p: StaffPermission) => true } },
      {
        provide: AdminCompanyHierarchyService,
        useValue: {
          hierarchyOf: answer,
          setFollowing: () => Promise.resolve(),
        } satisfies Partial<Record<keyof AdminCompanyHierarchyService, unknown>>,
      },
    ],
  });
  const fixture = TestBed.createComponent(PricingFollow);
  fixture.componentRef.setInput('companyId', 'child_1');
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function host(fixture: ComponentFixture<PricingFollow>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

describe('PricingFollow', () => {
  it('ne montre rien pour un compte sans principal', async () => {
    const fixture = await boot(() => Promise.resolve(ALONE));
    expect(host(fixture).querySelector('[data-follow-parent]')).toBeNull();
  });

  it('montre la case du tarif sur un sous-compte', async () => {
    const fixture = await boot(() =>
      Promise.resolve({ ...ALONE, parent: { id: 'p', enseigne: 'Club Med', status: 'active' } }),
    );
    expect(host(fixture).querySelector('[data-follow-parent]')).not.toBeNull();
  });

  it('une lecture ratée se dit sans masquer les prix', async () => {
    const fixture = await boot(() => Promise.reject(new Error('réseau')));
    expect(host(fixture).querySelector('[data-pricing-follow-error]')).not.toBeNull();
  });
});
