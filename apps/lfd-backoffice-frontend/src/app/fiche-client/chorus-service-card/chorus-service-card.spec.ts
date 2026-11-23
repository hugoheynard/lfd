import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { ChorusServicePayload, ChorusServiceView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import type { AdminCompanyDetail } from '../../comptes-clients/admin-company';
import { ChorusServiceCard } from './chorus-service-card';

function unite(chorusService: ChorusServiceView | null, followsBilling = true): AdminCompanyDetail {
  return {
    revision: 0,
    id: 'cmp_armee',
    reference: 'C-7',
    raisonSociale: 'Ministère des Armées',
    enseigne: 'Base aérienne 701',
    formeJuridique: '',
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
    archivedAt: null,
    archivedByName: null,
    archiveReason: null,
    hasOrders: false,
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
      parent: followsBilling
        ? { id: 'cmp_plateforme', enseigne: 'Commissariat', status: 'active' }
        : null,
      subAccounts: [],
      follows: followsBilling ? [{ aspect: 'billing', since: '2026-11-01T00:00:00.000Z' }] : [],
      groupWithoutDelivery: false,
      collectionForm: null,
    },
    chorusRouting: null,
    chorusService,
  };
}

const POSEE: ChorusServiceView = {
  payerCompanyId: 'cmp_plateforme',
  serviceCode: 'SE-TIGNES',
  currentCommitment: { number: 'ENG-2026-07', endsOn: '2026-12-31' },
  recordedAt: '2026-11-23T09:30:00.000Z',
  recordedBy: { name: 'Camille Rousseau', role: 'commercial' },
};

interface Wire {
  readonly put: ChorusServicePayload[];
  refuse: HttpErrorResponse | null;
  changed: number;
}

function boot(
  company: AdminCompanyDetail,
  canManage = true,
): { fixture: ComponentFixture<ChorusServiceCard>; wire: Wire } {
  const wire: Wire = { put: [], refuse: null, changed: 0 };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AdminCompaniesService,
        useValue: {
          setChorusService: (_id: string, payload: ChorusServicePayload): Promise<void> => {
            wire.put.push(payload);
            return wire.refuse === null ? Promise.resolve() : Promise.reject(wire.refuse);
          },
        } satisfies Partial<Record<keyof AdminCompaniesService, unknown>>,
      },
    ],
  });
  const fixture = TestBed.createComponent(ChorusServiceCard);
  fixture.componentRef.setInput('company', company);
  fixture.componentRef.setInput('canManage', canManage);
  fixture.componentInstance.changed.subscribe(() => (wire.changed += 1));
  fixture.detectChanges();
  return { fixture, wire };
}

const host = (fixture: ComponentFixture<ChorusServiceCard>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('ChorusServiceCard', () => {
  it('sans fiche, le dit et propose de la poser', () => {
    const { fixture } = boot(unite(null));
    expect(host(fixture).querySelector('[data-chorus-service-missing]')).not.toBeNull();
    expect(host(fixture).querySelector('[data-chorus-service-start]')).not.toBeNull();
  });

  it('sans le droit d’écrire, ne propose aucun geste', () => {
    const { fixture } = boot(unite(POSEE), false);
    expect(host(fixture).querySelector('button')).toBeNull();
  });

  it('montre le code, l’engagement en cours et qui l’a posée', () => {
    const { fixture } = boot(unite(POSEE));
    const text = host(fixture).textContent?.replace(/\s+/g, ' ') ?? '';
    expect(text).toContain('SE-TIGNES');
    expect(text).toContain("n° ENG-2026-07, jusqu'au 31/12/2026");
    expect(host(fixture).querySelector('[data-chorus-service-recorded]')?.textContent).toContain(
      'Posée le 23/11/2026 par Camille Rousseau (commercial).',
    );
    expect(host(fixture).querySelector('[data-chorus-service-payer-changed]')).toBeNull();
  });

  it('un payeur changé depuis la pose : la fiche ne propose plus rien', () => {
    const { fixture } = boot(unite({ ...POSEE, payerCompanyId: 'cmp_autre' }));
    expect(host(fixture).querySelector('[data-chorus-service-payer-changed]')).not.toBeNull();
  });

  it('préremplit la saisie de la fiche posée, et l’enregistre rognée', async () => {
    const { fixture, wire } = boot(unite(POSEE));
    const card = fixture.componentInstance;
    card.edit();
    expect(card['commitmentNumber']()).toBe('ENG-2026-07');
    card['serviceCode'].set('  SE-TIGNES-2 ');
    card['commitmentNumber'].set(' ENG-2027 ');
    card['commitmentEndsOn'].set('2027-06-30');
    await card['save']();

    expect(wire.put).toEqual([
      { serviceCode: 'SE-TIGNES-2', commitmentNumber: 'ENG-2027', commitmentEndsOn: '2027-06-30' },
    ]);
    expect(wire.changed).toBe(1);
    expect(card['editing']()).toBe(false);
  });

  it('retirer l’engagement repose la fiche sans numéro ni date', async () => {
    const { fixture, wire } = boot(unite(POSEE));
    const card = fixture.componentInstance;
    card.edit();
    card['clearCommitment']();
    await card['save']();

    expect(wire.put).toEqual([
      { serviceCode: 'SE-TIGNES', commitmentNumber: '', commitmentEndsOn: null },
    ]);
  });

  it('un numéro sans date ne part pas', async () => {
    const { fixture, wire } = boot(unite(null));
    const card = fixture.componentInstance;
    card.edit();
    card['commitmentNumber'].set('ENG-1');
    fixture.detectChanges();
    expect(host(fixture).querySelector('[data-chorus-service-unpaired]')).not.toBeNull();
    await card['save']();
    expect(wire.put).toEqual([]);
  });

  it('une société qui est son propre payeur : pas de code service, jamais envoyé', async () => {
    const { fixture, wire } = boot(unite(null, false));
    const card = fixture.componentInstance;
    card.edit();
    fixture.detectChanges();
    expect(host(fixture).querySelector('[data-chorus-service-code]')).toBeNull();
    card['serviceCode'].set('X');
    card['commitmentNumber'].set('ENG-1');
    card['commitmentEndsOn'].set('2026-12-31');
    await card['save']();
    expect(wire.put[0]?.serviceCode).toBe('');
  });

  it('un refus s’affiche tel quel et la saisie reste ouverte', async () => {
    const { fixture, wire } = boot(unite(null));
    wire.refuse = new HttpErrorResponse({
      status: 409,
      error: { message: 'Le payeur de cette société n’est pas un organisme public.' },
    });
    const card = fixture.componentInstance;
    card.edit();
    await card['save']();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host(fixture).querySelector('[data-chorus-service-refusal]')?.textContent).toContain(
      'Le payeur de cette société n’est pas un organisme public.',
    );
    expect(card['editing']()).toBe(true);
    expect(wire.changed).toBe(0);
  });
});
