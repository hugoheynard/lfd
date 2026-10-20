import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { CompanyHierarchyView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { AdminCompanyHierarchyService } from '../../comptes-clients/admin-company-hierarchy.service';
import type { AdminCompanyDetail } from '../../comptes-clients/admin-company';
import { GroupAccountCard } from './group-account-card';

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

interface Wire {
  readonly group: boolean[];
  refuse: HttpErrorResponse | null;
  changed: number;
}

function boot(company: AdminCompanyDetail): {
  fixture: ComponentFixture<GroupAccountCard>;
  wire: Wire;
} {
  const wire: Wire = { group: [], refuse: null, changed: 0 };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AdminCompanyHierarchyService,
        useValue: {
          setGroupWithoutDelivery: (_id: string, enabled: boolean): Promise<void> => {
            wire.group.push(enabled);
            return wire.refuse === null ? Promise.resolve() : Promise.reject(wire.refuse);
          },
        } satisfies Partial<Record<keyof AdminCompanyHierarchyService, unknown>>,
      },
    ],
  });
  const fixture = TestBed.createComponent(GroupAccountCard);
  fixture.componentRef.setInput('company', company);
  fixture.componentInstance.changed.subscribe(() => (wire.changed += 1));
  fixture.detectChanges();
  return { fixture, wire };
}

const box = (fixture: ComponentFixture<GroupAccountCard>): HTMLInputElement | null =>
  (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
    '[data-group-without-delivery] input[type="checkbox"]',
  );

async function settle(fixture: ComponentFixture<GroupAccountCard>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('GroupAccountCard', () => {
  it('montre ce qui est enregistré', () => {
    const { fixture } = boot(principal({ groupWithoutDelivery: true }));
    expect(box(fixture)?.checked).toBe(true);
  });

  it('s’écrit dès qu’on la coche, puis fait relire la fiche', async () => {
    const { fixture, wire } = boot(principal());
    box(fixture)?.click();
    await settle(fixture);
    expect(wire.group).toEqual([true]);
    expect(wire.changed).toBe(1);
  });

  it('un refus s’affiche tel quel, et la case revient à l’enregistré', async () => {
    const { fixture, wire } = boot(principal());
    wire.refuse = new HttpErrorResponse({
      status: 409,
      error: { message: 'Un sous-compte ne peut pas être un compte de groupe.' },
    });
    box(fixture)?.click();
    fixture.detectChanges();
    await settle(fixture);
    await settle(fixture);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-group-refusal]')?.textContent,
    ).toContain('Un sous-compte ne peut pas être un compte de groupe.');
    expect(box(fixture)?.checked).toBe(false);
    expect(wire.changed).toBe(0);
  });
});
