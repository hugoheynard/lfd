import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CompanyHierarchyView } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { AdminCompanyHierarchyService } from '../../comptes-clients/admin-company-hierarchy.service';
import type { AdminCompanyDetail } from '../../comptes-clients/admin-company';
import { SubAccountPanel } from '../panels/sub-account-panel/sub-account-panel';
import { SubAccountsCard } from './sub-accounts-card';

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
      ...hierarchy,
    },
  };
}

interface Wire {
  readonly group: boolean[];
  refuse: HttpErrorResponse | null;
  readonly opened: { component: unknown; data: unknown }[];
  changed: number;
}

function boot(company: AdminCompanyDetail): {
  fixture: ComponentFixture<SubAccountsCard>;
  wire: Wire;
} {
  const wire: Wire = { group: [], refuse: null, opened: [], changed: 0 };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: FoldPanelHostService,
        useValue: {
          open: (component: unknown, options: { data: unknown }) => {
            wire.opened.push({ component, data: options.data });
            return { closed: Promise.resolve('child_9') };
          },
        },
      },
      {
        provide: AdminCompanyHierarchyService,
        useValue: {
          setGroupWithoutDelivery: (_id: string, enabled: boolean) => {
            wire.group.push(enabled);
            const refuse = wire.refuse;
            // Comme le réseau : la réponse arrive après un rendu.
            return new Promise<void>((resolve, reject) =>
              setTimeout(() => (refuse === null ? resolve() : reject(refuse))),
            );
          },
        } satisfies Partial<Record<keyof AdminCompanyHierarchyService, unknown>>,
      },
    ],
  });
  const fixture = TestBed.createComponent(SubAccountsCard);
  fixture.componentRef.setInput('company', company);
  fixture.componentInstance.changed.subscribe(() => (wire.changed += 1));
  fixture.detectChanges();
  return { fixture, wire };
}

function host(fixture: ComponentFixture<SubAccountsCard>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

async function settle(fixture: ComponentFixture<SubAccountsCard>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('SubAccountsCard', () => {
  it('sans enfant, dit qu’il n’y en a pas', () => {
    const { fixture } = boot(principal());
    expect(host(fixture).textContent).toContain('Aucun sous-compte');
  });

  it('liste chaque sous-compte : enseigne vers sa fiche, ville, statut, aspects suivis', () => {
    const { fixture } = boot(
      principal({
        subAccounts: [
          {
            id: 'child_1',
            enseigne: 'Chalet des Cimes',
            city: 'Courchevel',
            status: 'pending',
            followedAspects: ['billing', 'pricing'],
          },
        ],
      }),
    );
    const row = host(fixture).querySelector('[data-sub-account]');
    expect(row?.querySelector('a')?.getAttribute('href')).toBe('/comptes-clients/child_1');
    expect(row?.textContent).toContain('Courchevel');
    expect(row?.textContent).toContain('En attente');
    expect(row?.textContent).toContain('Facturation · Tarif');
  });

  it('« Créer un sous-compte » ouvre le panneau sous ce principal, SIREN proposé', async () => {
    const { fixture, wire } = boot(principal());
    host(fixture).querySelector<HTMLButtonElement>('[data-create]')?.click();
    await settle(fixture);

    expect(wire.opened[0]?.component).toBe(SubAccountPanel);
    expect(wire.opened[0]?.data).toEqual({
      parentId: 'parent_1',
      parentName: 'Chalets du Lac',
      parentRaisonSociale: 'Chalets SAS',
      parentSiret: '73282932000074',
      parentVatNumber: '',
    });
    expect(wire.changed).toBe(1);
  });

  it('la case « Compte de groupe » s’écrit dès qu’on la coche', async () => {
    const { fixture, wire } = boot(principal());
    host(fixture)
      .querySelector<HTMLInputElement>('[data-group-without-delivery] input[type="checkbox"]')
      ?.click();
    await settle(fixture);

    expect(wire.group).toEqual([true]);
    expect(wire.changed).toBe(1);
  });

  it('un refus de la case s’affiche tel quel, et elle revient à l’enregistré', async () => {
    const { fixture, wire } = boot(principal());
    wire.refuse = new HttpErrorResponse({
      status: 409,
      error: { message: 'Un sous-compte ne peut pas être un compte de groupe.' },
    });
    const box = host(fixture).querySelector<HTMLInputElement>(
      '[data-group-without-delivery] input[type="checkbox"]',
    );
    box?.click();
    fixture.detectChanges();
    await settle(fixture);
    await settle(fixture);

    expect(host(fixture).querySelector('[data-group-refusal]')?.textContent).toContain(
      'Un sous-compte ne peut pas être un compte de groupe.',
    );
    expect(box?.checked).toBe(false);
  });
});
