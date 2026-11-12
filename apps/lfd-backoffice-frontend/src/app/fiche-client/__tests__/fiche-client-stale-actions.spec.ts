import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { AdminCompanyDetail } from '../../comptes-clients/admin-company';
import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import { STALE_SHEET_CODE } from '../../comptes-clients/sheet-revision';
import { NotifyService } from '../../notify.service';
import { FicheClientActions } from '../informations/fiche-client.actions';

/**
 * Les gestes en ligne de la fiche (crédits accordés, préférence) envoient la
 * révision lue ; refusés pour fiche périmée, ils demandent la relecture —
 * le contrôle montre alors ce que quelqu'un d'autre vient de poser.
 */

const PREFERENCE = {
  method: 'pickup' as const,
  pickupAddressId: null,
  deliveryAddressId: null,
  signatureRequired: false,
};

const COMPANY: AdminCompanyDetail = {
  revision: 0,
  activation: null,
  gate: { canActivate: false, blocking: [], checklist: [] },
  suspensionCause: null,
  id: 'cmp_1',
  reference: 'C-ADM001',
  raisonSociale: 'Café des Halles SAS',
  enseigne: '',
  formeJuridique: 'SAS',
  siret: '81245678900021',
  siren: '',
  vatNumber: '',
  status: 'pending',
  grantedTerms: [],
  requestedTerm: null,
  directDebitBlocked: false,
  primaryContact: {
    id: null,
    role: null,
    firstName: 'Camille',
    lastName: 'Rousseau',
    fonction: 'Gérante',
    email: 'gerant@halles.fr',
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
  vatNumberRequired: true,
  hasBankAccount: false,
  hierarchy: {
    parent: null,
    subAccounts: [],
    follows: [],
    groupWithoutDelivery: false,
    collectionForm: null,
  },
  addresses: { billing: null, deliveries: [] },
  contacts: [],
  fulfillmentPreference: {
    method: null,
    pickupAddressId: null,
    deliveryAddressId: null,
    signatureRequired: false,
  },
};

function companyAt(revision: number): AdminCompanyDetail {
  return { ...COMPANY, id: 'c1', revision };
}

class RecordingCompanies {
  revisions: (number | null)[] = [];
  constructor(private readonly refusal: unknown = null) {}
  private answer(revision: number | null): Promise<void> {
    this.revisions.push(revision);
    return this.refusal === null ? Promise.resolve() : Promise.reject(this.refusal);
  }
  grantTerms(_id: string, _terms: unknown, revision: number | null): Promise<void> {
    return this.answer(revision);
  }
  preferFulfillment(_id: string, _payload: unknown, revision: number | null): Promise<void> {
    return this.answer(revision);
  }
}

class SilentNotify {
  errors = 0;
  success(): void {}
  error(): void {
    this.errors += 1;
  }
}

function setup(refusal: unknown = null) {
  const companies = new RecordingCompanies(refusal);
  const notify = new SilentNotify();
  TestBed.configureTestingModule({
    providers: [
      FicheClientActions,
      { provide: AdminCompaniesService, useValue: companies },
      { provide: NotifyService, useValue: notify },
    ],
  });
  return { actions: TestBed.inject(FicheClientActions), companies, notify };
}

const STALE = new HttpErrorResponse({ status: 409, error: { code: STALE_SHEET_CODE } });
const OTHER = new HttpErrorResponse({ status: 409, error: { code: 'account.other' } });

describe('la fiche périmée — gestes en ligne', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('les crédits accordés partent avec la révision lue', async () => {
    const { actions, companies } = setup();

    expect(await actions.grantTerms(companyAt(5), ['monthly'])).toBe(true);
    expect(companies.revisions).toEqual([5]);
  });

  it('la préférence part avec la révision lue', async () => {
    const { actions, companies } = setup();

    expect(await actions.preferFulfillment(companyAt(2), PREFERENCE)).toBe(true);
    expect(companies.revisions).toEqual([2]);
  });

  it('refusé pour fiche périmée : dit le refus et demande la relecture', async () => {
    const { actions, notify } = setup(STALE);

    expect(await actions.grantTerms(companyAt(5), ['monthly'])).toBe(true);
    expect(notify.errors).toBe(1);
  });

  it('un autre refus ne relit rien', async () => {
    const { actions, notify } = setup(OTHER);

    expect(await actions.preferFulfillment(companyAt(2), PREFERENCE)).toBe(false);
    expect(notify.errors).toBe(1);
  });
});
