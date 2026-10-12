import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { LegalEntityView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

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
      { closesAt: NOV_1, periodLabel: 'du 1er au 31 octobre 2026', invoicedOn: '2026-10-31' },
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
    collectionDaysAfterClosure: null,
    depositCutoff: null,
    nextCollection: {
      closesAt: '2026-10-31T23:00:00.000Z',
      plannedConstitutionAt: '2026-11-01T00:00:00.000Z',
      collectionDay: '2026-11-16',
      depositDeadline: null,
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
    ...over,
  };
}

function boot(over: Partial<LegalEntityView> = {}): ComponentFixture<BillingModesCard> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [BillingModesCard] });
  const fixture = TestBed.createComponent(BillingModesCard);
  fixture.componentRef.setInput('entity', entity(over));
  fixture.detectChanges();
  return fixture;
}

const block = (fixture: ComponentFixture<BillingModesCard>, mode: string): string =>
  (
    (fixture.nativeElement as HTMLElement).querySelector(`[data-billing-mode="${mode}"]`)
      ?.textContent ?? ''
  ).replace(/\s+/gu, ' ');

describe('BillingModesCard — les dates des trois modes, en lecture (M1)', () => {
  it('dit chaque mode, ses dates en vigueur et le nombre de clients qui l’ont choisi', () => {
    const fixture = boot();

    expect(block(fixture, 'semimonthly')).toContain('Deux fois par mois, clôtures le 1er et le 16');
    expect(block(fixture, 'weekly')).toContain('Chaque semaine, clôture le lundi');
    expect(block(fixture, 'weekly')).toContain('2 clients l’ont choisi');
    expect(block(fixture, 'monthly')).toContain(
      'c’est aussi le mode de tout client qui n’a rien choisi',
    );
  });

  it('dit le programmé, le verrou et les prochaines clôtures, tels que le serveur les donne', () => {
    const monthly = block(boot(), 'monthly');

    expect(monthly).toContain(
      'Programmé : Chaque mois, clôture le 15, à partir de la clôture du 1er novembre 2026',
    );
    expect(monthly).toContain('un autre sera possible à partir du 1er novembre 2026');
    expect(monthly).toContain('Période du 1er au 31 octobre 2026');
  });

  it('ne propose aucun geste : elle ne fait que dire', () => {
    const host = boot().nativeElement as HTMLElement;

    expect(host.querySelector('button')).toBeNull();
    expect(host.querySelector('[data-modes-readonly]')).not.toBeNull();
  });
});
