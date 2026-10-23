import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { LegalEntityView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { LegalEntitiesService } from '../../../legal-entities.service';
import type { BillingModeSaved } from '../billing-mode-row/billing-mode-row';

import { BillingModesCard } from './billing-modes-card';

/** Les instants ne sont comparés qu'entre eux et aux libellés : aucune lecture du mur. */
const NOV_1 = '2026-10-31T23:00:00.000Z';

const MODES: LegalEntityView['billingModes'] = [
  {
    mode: 'monthly',
    current: { days: [1], since: null },
    scheduled: { days: [15], effectiveAt: NOV_1 },
    changeLockedUntil: NOV_1,
    upcomingClosures: [
      {
        closesAt: NOV_1,
        periodLabel: 'du 1er au 31 octobre 2026',
        invoicedOn: '2026-10-31',
        periodDays: 31,
      },
    ],
    payerCount: 0,
  },
  {
    mode: 'semimonthly',
    current: { days: [1, 16], since: null },
    scheduled: null,
    changeLockedUntil: null,
    upcomingClosures: [],
    payerCount: 0,
  },
  {
    mode: 'weekly',
    current: { days: [1], since: null },
    scheduled: null,
    changeLockedUntil: null,
    upcomingClosures: [],
    payerCount: 2,
  },
];

function entity(over: Partial<LegalEntityView> = {}): LegalEntityView {
  return {
    id: 'le1',
    name: 'La Folie Douce',
    legalForm: 'SAS',
    siren: '552100554',
    vatNumber: '',
    rcs: '',
    shareCapitalCents: 0,
    addressLine1: '12 rue du Fournil',
    addressLine2: '',
    postalCode: '73000',
    city: 'Chambéry',
    countryCode: 'FR',
    ics: '',
    creditorBic: '',
    creditorAccountHolder: '',
    creditorAccountLine1: '',
    creditorAccountLine2: '',
    creditorAccountPostalCode: '',
    creditorAccountCity: '',
    creditorAccountCountryCode: '',
    creditorAccountLast4: '',
    creditorIdentityFrozen: false,
    preNotificationDays: 14,
    autoCollectionEnabled: false,
    autoCollectionDelayHours: 1,
    billingModes: MODES,
    lastClosure: '2026-09-30T22:00:00.000Z',
    lastClosurePeriod: {
      closesAt: '2026-09-30T22:00:00.000Z',
      startsAt: '2026-08-31T22:00:00.000Z',
      label: 'du 1er au 30 septembre 2026',
    },
    collectionDaysAfterClosure: null,
    depositCutoff: null,
    nextCollection: {
      closesAt: '2026-10-31T23:00:00.000Z',
      plannedConstitutionAt: '2026-11-01T00:00:00.000Z',
      collectionDay: '2026-11-16',
      depositDeadline: null,
      tightDepositMargin: null,
    },
    mandateContractDescription: '',
    mandatePaymentType: 'recurrent',
    mandateScheme: 'B2B',
    archivedAt: null,
    canCollect: false,
    hasLogo: false,
    lastAutopilotRun: null,
    isLastActive: false,
    missingToCollect: [],
    invoicePaymentTerms: {
      latePenaltyRateBasisPoints: null,
      recoveryIndemnityCents: null,
      earlyPaymentDiscount: null,
    },
    missingToInvoice: [],
    invoicePrefix: 'LFD',
    invoicePrefixFrozen: false,
    ...over,
  };
}

function boot(over: Partial<LegalEntityView> = {}): ComponentFixture<BillingModesCard> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [BillingModesCard],
    providers: [{ provide: LegalEntitiesService, useValue: {} }],
  });
  const fixture = TestBed.createComponent(BillingModesCard);
  fixture.componentRef.setInput('entity', entity(over));
  fixture.detectChanges();
  return fixture;
}

const host = (fixture: ComponentFixture<BillingModesCard>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('BillingModesCard — les dates des trois modes (M4b)', () => {
  it('une ligne par mode, dans l’ordre du serveur', () => {
    const rows = [...host(boot()).querySelectorAll('[data-billing-mode]')].map((row) =>
      row.getAttribute('data-billing-mode'),
    );

    expect(rows).toEqual(['monthly', 'semimonthly', 'weekly']);
  });

  it('dit une fois ce qu’est une date de clôture', () => {
    expect(host(boot()).querySelector('[data-modes-closure-time]')?.textContent).toContain(
      'la facture de la période part la veille à 23h55',
    );
  });

  it('remonte le geste d’une ligne à la page, qui relit et annonce', () => {
    const fixture = boot();
    const saved: BillingModeSaved[] = [];
    fixture.componentInstance.saved.subscribe((request) => saved.push(request));
    const request: BillingModeSaved = { action: () => Promise.resolve(), said: 'fait' };

    fixture.debugElement
      .query((node) => node.name === 'app-billing-mode-row')
      .triggerEventHandler('saved', request);

    expect(saved).toEqual([request]);
  });
});
