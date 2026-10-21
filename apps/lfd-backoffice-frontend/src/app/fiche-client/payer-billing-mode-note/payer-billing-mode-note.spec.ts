import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CompanyHierarchyView, PayerBillingModeView, StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import type { AdminCompanyDetail } from '../../comptes-clients/admin-company';
import { LegalEntitiesService } from '../../comptabilite/legal-entities.service';
import { PayerBillingModeService } from '../facturation/payer-billing-mode.service';
import { PayerBillingModeNote } from './payer-billing-mode-note';

function company(hierarchy: Partial<CompanyHierarchyView> = {}): AdminCompanyDetail {
  return {
    id: 'c1',
    reference: 'C-1',
    raisonSociale: 'Chalets SAS',
    enseigne: 'Chalets du Lac',
    formeJuridique: 'SAS',
    siret: '73282932000074',
    siren: '732829320',
    vatNumber: '',
    status: 'active',
    grantedTerms: [],
    requestedTerm: null,
    directDebitBlocked: false,
    primaryContact: {
      id: null,
      role: null,
      firstName: '',
      lastName: '',
      fonction: '',
      email: '',
      phone: '',
    },
    kbis: null,
    owner: null,
    hasOpenSupportRequest: false,
    parent: null,
    createdAt: '2026-07-30T10:00:00.000Z',
    activatedAt: null,
    warnings: [],
    activation: null,
    gate: { canActivate: false, blocking: [], checklist: [] },
    suspensionCause: null,
    vatNumberRequired: false,
    hasBankAccount: false,
    addresses: { billing: null, deliveries: [] },
    contacts: [],
    fulfillmentPreference: {
      method: null,
      pickupAddressId: null,
      deliveryAddressId: null,
      signatureRequired: false,
    },
    hierarchy: {
      parent: null,
      subAccounts: [],
      follows: [],
      groupWithoutDelivery: false,
      collectionForm: null,
      ...hierarchy,
    },
  };
}

const VIEW: PayerBillingModeView = {
  legalEntityId: 'le1',
  payerCompanyId: 'c1',
  mode: 'weekly',
  since: null,
  scheduled: { mode: 'monthly', effectiveAt: '2026-10-31T23:00:00.000Z' },
  changeLockedUntil: null,
  upcomingClosures: [],
};

async function boot(
  client: AdminCompanyDetail,
  granted: readonly StaffPermission[] = ['b2b_accounting:read'],
): Promise<{ fixture: ComponentFixture<PayerBillingModeNote>; gets: () => number }> {
  let gets = 0;
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [PayerBillingModeNote],
    providers: [
      provideRouter([]),
      {
        provide: LegalEntitiesService,
        useValue: { list: () => Promise.resolve([{ id: 'le1', name: 'LFD', archivedAt: null }]) },
      },
      {
        provide: PayerBillingModeService,
        useValue: {
          get: () => {
            gets += 1;
            return Promise.resolve(VIEW);
          },
        },
      },
      {
        provide: PermissionsStore,
        useValue: { can: (permission: StaffPermission): boolean => granted.includes(permission) },
      },
    ],
  });
  const fixture = TestBed.createComponent(PayerBillingModeNote);
  fixture.componentRef.setInput('company', client);
  fixture.detectChanges();
  for (let turn = 0; turn < 3; turn += 1) {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
  }
  return { fixture, gets: () => gets };
}

const text = (fixture: ComponentFixture<PayerBillingModeNote>): string =>
  ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/gu, ' ');

describe('PayerBillingModeNote — le rappel du mode dans Facturation', () => {
  it('dit le mode courant, le programmé, et renvoie à Informations', async () => {
    const { fixture } = await boot(company());

    expect(text(fixture)).toContain(
      'Mode de facturation : Chaque semaine (passage à Mensuel programmé).',
    );
    const link = (fixture.nativeElement as HTMLElement).querySelector('a');
    expect(link?.textContent).toContain('Informations');
    expect(link?.getAttribute('href')).toBe('/comptes-clients/c1/informations');
  });

  it('un site facturé chez son payeur nomme le payeur, sans lecture', async () => {
    const { fixture, gets } = await boot(
      company({
        parent: { id: 'p1', enseigne: 'Chalets du Lac', status: 'active' },
        follows: [{ aspect: 'billing', since: '2026-09-10T08:00:00.000Z' }],
      }),
    );

    expect(gets()).toBe(0);
    expect(text(fixture)).toContain('celui de Chalets du Lac');
  });

  it('sans droit comptable : pas de mode inventé, le renvoi reste', async () => {
    const { fixture, gets } = await boot(company(), []);

    expect(gets()).toBe(0);
    expect(text(fixture)).not.toContain('Mensuel');
    expect(text(fixture)).toContain('Informations');
  });
});
