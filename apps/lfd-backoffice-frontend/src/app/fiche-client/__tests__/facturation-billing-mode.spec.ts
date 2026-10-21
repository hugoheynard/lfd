import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CompanyHierarchyView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { AdminOrdersService } from '../../commandes/orders.service';
import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import type { AdminCompanyDetail } from '../../comptes-clients/admin-company';
import { NotifyService } from '../../notify.service';
import { ClientFacturationPage } from '../facturation/facturation-page';

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

/**
 * Le mode de facturation a quitté Facturation le 2026-10-21 pour Informations :
 * ici, une ligne de rappel et un renvoi, plus de second endroit pour le régler.
 */
describe('ClientFacturationPage — le mode de facturation', () => {
  it('ne porte plus la carte du mode, mais la ligne qui renvoie à Informations', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AdminOrdersService, useValue: { list: () => Promise.resolve({ rows: [] }) } },
        { provide: AdminCompaniesService, useValue: { getById: () => Promise.resolve(company()) } },
        { provide: PermissionsStore, useValue: { can: () => false } },
        {
          provide: NotifyService,
          useValue: { success: () => undefined, info: () => undefined, error: () => undefined },
        },
      ],
    });
    const fixture = TestBed.createComponent(ClientFacturationPage);
    fixture.componentRef.setInput('id', 'c1');
    fixture.detectChanges();
    for (let turn = 0; turn < 3; turn += 1) {
      await new Promise((resolve) => setTimeout(resolve));
      await fixture.whenStable();
      fixture.detectChanges();
    }
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('app-payer-billing-mode-card')).toBeNull();
    const note = host.querySelector('[data-payer-mode-note]');
    expect(note?.querySelector('a')?.getAttribute('href')).toBe('/comptes-clients/c1/informations');
  });
});
