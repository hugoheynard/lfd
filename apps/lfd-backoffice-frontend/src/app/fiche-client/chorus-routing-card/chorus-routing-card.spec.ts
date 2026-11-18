import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { ChorusRoutingPayload, ChorusRoutingView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import type { AdminCompanyDetail } from '../../comptes-clients/admin-company';
import { ChorusRoutingCard } from './chorus-routing-card';

function organisme(
  formeJuridique: string,
  chorusRouting: ChorusRoutingView | null,
): AdminCompanyDetail {
  return {
    revision: 0,
    id: 'cmp_armee',
    reference: 'C-7',
    raisonSociale: 'Ministère des Armées',
    enseigne: 'Base aérienne 701',
    formeJuridique,
    siret: '11000000000000',
    siren: '110000000',
    vatNumber: '',
    status: 'pending',
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
    declaredVia: null,
    piecesReached: [],
    activatedAt: null,
    warnings: [],
    activation: null,
    gate: { canActivate: false, blocking: ['chorus'], checklist: [] },
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
    },
    chorusRouting,
  };
}

const RELEVEE: ChorusRoutingView = {
  commitmentRequired: true,
  serviceCodeRequired: false,
  defaultServiceCode: '',
  checkedOn: '2026-11-12',
  checkedBy: { name: 'Camille Rousseau', role: 'commercial' },
};

interface Wire {
  readonly put: ChorusRoutingPayload[];
  refuse: HttpErrorResponse | null;
  changed: number;
}

function boot(
  company: AdminCompanyDetail,
  canManage = true,
): { fixture: ComponentFixture<ChorusRoutingCard>; wire: Wire } {
  const wire: Wire = { put: [], refuse: null, changed: 0 };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AdminCompaniesService,
        useValue: {
          setChorusRouting: (_id: string, payload: ChorusRoutingPayload): Promise<void> => {
            wire.put.push(payload);
            return wire.refuse === null ? Promise.resolve() : Promise.reject(wire.refuse);
          },
        } satisfies Partial<Record<keyof AdminCompaniesService, unknown>>,
      },
    ],
  });
  const fixture = TestBed.createComponent(ChorusRoutingCard);
  fixture.componentRef.setInput('company', company);
  fixture.componentRef.setInput('canManage', canManage);
  fixture.componentInstance.changed.subscribe(() => (wire.changed += 1));
  fixture.detectChanges();
  return { fixture, wire };
}

const host = (fixture: ComponentFixture<ChorusRoutingCard>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('ChorusRoutingCard', () => {
  it('dit que la fiche manque, et propose de la relever', () => {
    const { fixture } = boot(organisme('public_state', null));
    const missing = host(fixture).querySelector('[data-chorus-missing]');
    expect(missing?.textContent).toContain("n'est pas encore relevée");
    expect(missing?.textContent).toContain('Relever la fiche');
  });

  it('sans le droit d’écrire, ne propose aucun geste', () => {
    const { fixture } = boot(organisme('public_state', null), false);
    expect(host(fixture).querySelector('[data-chorus-missing]')?.textContent).not.toContain(
      'Relever la fiche',
    );
  });

  it('montre la fiche relevée, le délai de la catégorie et qui l’a vérifiée', () => {
    const { fixture } = boot(organisme('public_health_establishment', RELEVEE));
    const text = host(fixture).textContent ?? '';
    expect(text).toContain('Exigé');
    expect(text).toContain('50 jours après le dépôt');
    expect(host(fixture).querySelector('[data-chorus-checked]')?.textContent).toContain(
      'Vérifié le 12/11/2026 par Camille Rousseau (commercial).',
    );
  });

  it('enregistre la saisie, code rogné, datée du jour par défaut', async () => {
    const { fixture, wire } = boot(organisme('public_state', null));
    const card = fixture.componentInstance;
    card.edit();
    card['serviceCodeRequired'].set(true);
    card['defaultServiceCode'].set('  SERV-01 ');
    await card['save']();

    expect(wire.put).toEqual([
      {
        commitmentRequired: false,
        serviceCodeRequired: true,
        defaultServiceCode: 'SERV-01',
        checkedOn: card['today'],
      },
    ]);
    expect(wire.changed).toBe(1);
    expect(card['editing']()).toBe(false);
  });

  it('préremplit la saisie de la fiche posée', () => {
    const { fixture } = boot(organisme('public_state', RELEVEE));
    const card = fixture.componentInstance;
    card.edit();
    expect(card['commitmentRequired']()).toBe(true);
    expect(card['serviceCodeRequired']()).toBe(false);
  });

  it('n’enregistre pas sans date de relevé', async () => {
    const { fixture, wire } = boot(organisme('public_state', null));
    const card = fixture.componentInstance;
    card.edit();
    card['checkedOn'].set('');
    await card['save']();
    expect(wire.put).toEqual([]);
  });

  it('un refus s’affiche tel quel et la saisie reste ouverte', async () => {
    const { fixture, wire } = boot(organisme('sas', null));
    wire.refuse = new HttpErrorResponse({
      status: 409,
      error: { message: "Cette société n'est pas un organisme public." },
    });
    const card = fixture.componentInstance;
    card.edit();
    await card['save']();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host(fixture).querySelector('[data-chorus-refusal]')?.textContent).toContain(
      "Cette société n'est pas un organisme public.",
    );
    expect(card['editing']()).toBe(true);
    expect(wire.changed).toBe(0);
  });
});
