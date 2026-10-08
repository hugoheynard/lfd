import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CompanyHierarchyView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { AdminCompanyHierarchyService } from '../../comptes-clients/admin-company-hierarchy.service';
import type { AdminCompanyDetail } from '../../comptes-clients/admin-company';
import { FicheClientFacade } from '../informations/fiche-client.facade';
import { ClientSubAccountsPage, followReminders } from './sub-accounts-page';

function principal(hierarchy: Partial<CompanyHierarchyView> = {}): AdminCompanyDetail {
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

/** La façade réduite à ce que l'onglet lit. */
function boot(company: AdminCompanyDetail): ComponentFixture<ClientSubAccountsPage> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AdminCompanyHierarchyService, useValue: {} }],
  });
  TestBed.overrideComponent(ClientSubAccountsPage, {
    set: {
      providers: [
        {
          provide: FicheClientFacade,
          useValue: {
            state: signal('ready'),
            company: signal(company),
            windowMode: signal('slot'),
            start: () => Promise.resolve(),
            reload: () => Promise.resolve(),
          },
        },
      ],
    },
  });
  const fixture = TestBed.createComponent(ClientSubAccountsPage);
  fixture.detectChanges();
  return fixture;
}

/** L'état de la disclosure de l'aide, lu sur son bouton. */
function helpOpen(host: HTMLElement): boolean {
  const toggle = host.querySelector('[data-sub-accounts-help] [aria-expanded]');
  return toggle?.getAttribute('aria-expanded') === 'true';
}

describe('ClientSubAccountsPage', () => {
  it('montre sur un client seul le bloc des sous-comptes, sans bandeau', () => {
    const host = boot(principal()).nativeElement as HTMLElement;
    expect(host.querySelector('app-sub-accounts-card')).not.toBeNull();
    expect(host.querySelector('[data-parent-banner]')).toBeNull();
  });

  it('ouvre l’aide sur un client sans parent ni sous-compte, la replie sinon', () => {
    const alone = boot(principal()).nativeElement as HTMLElement;
    expect(alone.querySelector('[data-sub-accounts-help]')?.textContent).toContain(
      'Comment fonctionnent les sous-comptes',
    );
    expect(alone.querySelector('[data-sub-accounts-help] h3')?.textContent).toContain(
      "Ce qu'un sous-compte peut reprendre du principal",
    );
    expect(helpOpen(alone)).toBe(true);

    const withChild = principal({
      subAccounts: [
        { id: 's1', enseigne: 'Chalet', city: null, status: 'pending', followedAspects: [] },
      ],
    });
    expect(helpOpen(boot(withChild).nativeElement as HTMLElement)).toBe(false);
  });

  it('montre sur un sous-compte le bandeau et le rappel des aspects, avec leurs onglets', () => {
    const site = principal({
      parent: { id: 'p1', enseigne: 'Alpes Chalets', status: 'active' },
      follows: [{ aspect: 'billing', since: '2026-09-10T08:00:00.000Z' }],
    });
    const host = boot(site).nativeElement as HTMLElement;

    expect(host.querySelector('[data-parent-banner]')?.textContent).toContain('Site de');
    expect(host.querySelector('app-sub-accounts-card')).toBeNull();
    expect(host.querySelector('[data-billing-follow] app-follow-parent-toggle')).not.toBeNull();
    const billing = host.querySelector('[data-follow-reminder="billing"]');
    expect(billing?.textContent).toContain('suivi depuis le');
    expect(billing?.querySelector('a')?.getAttribute('href')).toBe(
      '/comptes-clients/parent_1/sous-comptes',
    );
    expect(host.querySelector('[data-follow-reminder="pricing"]')?.textContent).toContain(
      'non suivi',
    );
  });
});

describe('ClientSubAccountsPage — facturation d’un site', () => {
  it('propose la forme de prélèvement à un site, pas à une entité qui règle seule', () => {
    const parent = { id: 'p1', enseigne: 'Alpes Chalets', status: 'active' as const };
    const site = principal({
      parent,
      follows: [{ aspect: 'billing', since: '2026-09-10T08:00:00.000Z' }],
    });
    expect(
      (boot(site).nativeElement as HTMLElement).querySelector('[data-collection-form]'),
    ).not.toBeNull();

    const entity = principal({ parent, follows: [] });
    expect(
      (boot(entity).nativeElement as HTMLElement).querySelector('[data-collection-form]'),
    ).toBeNull();
  });
});

describe('followReminders', () => {
  it('rend les trois aspects, et renvoie le tarif vers son onglet', () => {
    const reminders = followReminders([]);
    expect(reminders.map((r) => [r.aspect, r.since, r.tab])).toEqual([
      ['billing', null, 'sous-comptes'],
      ['pricing', null, 'tarifs'],
      ['contacts', null, 'informations'],
    ]);
  });
});
