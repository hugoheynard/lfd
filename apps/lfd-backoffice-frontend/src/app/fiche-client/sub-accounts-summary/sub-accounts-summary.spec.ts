import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CompanyHierarchyView, SubAccountView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { AdminCompanyHierarchyService } from '../../comptes-clients/admin-company-hierarchy.service';
import { SubAccountsSummary } from './sub-accounts-summary';

const CHALET: SubAccountView = {
  id: 'child_1',
  enseigne: 'Chalet Edelweiss',
  city: "Val d'Isère",
  status: 'active',
  followedAspects: ['billing'],
  follows: [{ aspect: 'billing', since: '2026-09-10T08:00:00.000Z' }],
};

async function render(
  hierarchyOf: () => Promise<CompanyHierarchyView | undefined>,
): Promise<HTMLElement> {
  TestBed.configureTestingModule({
    imports: [SubAccountsSummary],
    providers: [
      provideRouter([]),
      { provide: AdminCompanyHierarchyService, useValue: { hierarchyOf } },
    ],
  });
  const fixture = TestBed.createComponent(SubAccountsSummary);
  fixture.componentRef.setInput('companyId', 'parent_1');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

function hierarchy(subAccounts: readonly SubAccountView[]): CompanyHierarchyView {
  return {
    parent: null,
    subAccounts,
    follows: [],
    groupWithoutDelivery: false,
    collectionForm: null,
  };
}

describe('SubAccountsSummary', () => {
  it('liste les sous-comptes, chacun vers sa fiche', async () => {
    const host = await render(() => Promise.resolve(hierarchy([CHALET])));
    const rows = host.querySelectorAll('[data-sub-account]');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain('Chalet Edelweiss');
    expect(rows[0]?.querySelector('a')?.getAttribute('href')).toBe('/comptes-clients/child_1');
  });

  it('ne rend rien sans sous-compte', async () => {
    const host = await render(() => Promise.resolve(hierarchy([])));
    expect(host.querySelector('fold-card')).toBeNull();
  });

  it('disparaît si la lecture échoue, sans casser le tableau de bord', async () => {
    const host = await render(() => Promise.reject(new Error('réseau')));
    expect(host.querySelector('fold-card')).toBeNull();
  });
});
