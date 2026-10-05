import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { CompanyHierarchyView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import type { AdminCompanyDetail } from '../../comptes-clients/admin-company';
import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import { DeliveryAvailabilityService } from '../../b2b/reglages/delivery-availability.service';
import { PickupAddressesService } from '../../b2b/reglages/pickup-addresses.service';
import { NotifyService } from '../../notify.service';
import { InformationsPage } from '../informations/informations-page';

function company(hierarchy: Partial<CompanyHierarchyView> = {}): AdminCompanyDetail {
  return {
    id: 'parent_1',
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

const PRINCIPAL: AdminCompanyDetail = {
  ...company(),
  addresses: {
    billing: {
      id: 'b1',
      label: 'Siège',
      ligne1: '1 place du Lac',
      ligne2: '',
      codePostal: '74000',
      ville: 'Annecy',
      pays: 'France',
    },
    deliveries: [],
  },
  vatNumber: 'FR12732829320',
};

/** Le compte lu sous l'identifiant `child_1`, rattaché à `parent_1`. */
function child(follows: CompanyHierarchyView['follows']): AdminCompanyDetail {
  return {
    ...company({
      parent: { id: 'parent_1', enseigne: 'Chalets du Lac', status: 'active' },
      follows,
    }),
    id: 'child_1',
    raisonSociale: '',
    enseigne: 'Chalet Arolle',
    siret: '',
    siren: '',
  };
}

async function boot(fiche: AdminCompanyDetail): Promise<ComponentFixture<InformationsPage>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ id: 'child_1' }) } },
      },
      {
        provide: AdminCompaniesService,
        useValue: {
          getById: (id: string) => Promise.resolve(id === 'parent_1' ? PRINCIPAL : fiche),
        },
      },
      { provide: PickupAddressesService, useValue: { list: () => Promise.resolve([]) } },
      {
        provide: DeliveryAvailabilityService,
        useValue: {
          read: () =>
            Promise.resolve({
              openToB2b: true,
              openToB2c: true,
              windowMode: 'slot',
              updatedAt: null,
              updatedBy: null,
            }),
        },
      },
      { provide: PermissionsStore, useValue: { can: () => true } },
      {
        provide: NotifyService,
        useValue: { success: () => undefined, info: () => undefined, error: () => undefined },
      },
    ],
  });
  const fixture = TestBed.createComponent(InformationsPage);
  fixture.detectChanges();
  for (let turn = 0; turn < 3; turn += 1) {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
  }
  return fixture;
}

describe('InformationsPage — un SITE (suit la facturation)', () => {
  it('montre l’identité, la facturation et le règlement du principal, en lecture', async () => {
    const host = (await boot(child([{ aspect: 'billing', since: '2026-09-10T08:00:00.000Z' }])))
      .nativeElement as HTMLElement;

    expect(host.querySelector('[data-site-identity]')?.textContent).toContain('Chalets SAS');
    expect(host.querySelector('lfd-company-identity-card')).toBeNull();
    expect(host.querySelector('[data-billing-carried]')?.textContent).toContain('Chalets du Lac');
    expect(host.textContent).toContain('1 place du Lac');
    expect(host.querySelector('[data-site-payment]')?.textContent).toContain('par carte');
    expect(host.querySelector('app-paiement-section')).toBeNull();
  });

  it('n’a plus de case « facturation », et met la case « contacts » dans la carte Contacts', async () => {
    const host = (await boot(child([{ aspect: 'billing', since: '2026-09-10T08:00:00.000Z' }])))
      .nativeElement as HTMLElement;
    const toggles = [...host.querySelectorAll('app-follow-parent-toggle')];
    expect(toggles).toHaveLength(1);
    expect(toggles[0]?.closest('lfd-company-contacts-card')).not.toBeNull();
  });
});

describe('InformationsPage — une ENTITÉ (ne suit pas la facturation)', () => {
  it('reste la fiche d’un client : identité, facturation et paiement propres', async () => {
    const host = (await boot(child([]))).nativeElement as HTMLElement;

    expect(host.querySelector('[data-site-identity]')).toBeNull();
    expect(host.querySelector('lfd-company-identity-card')).not.toBeNull();
    expect(host.querySelector('[data-billing-carried]')).toBeNull();
    expect(host.querySelector('app-paiement-section')).not.toBeNull();
    const toggles = [...host.querySelectorAll('app-follow-parent-toggle')];
    expect(toggles).toHaveLength(1);
    expect(toggles[0]?.closest('lfd-company-contacts-card')).not.toBeNull();
  });
});
