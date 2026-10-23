import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { LegalEntityView } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { LegalEntitiesService } from '../../../legal-entities.service';
import { SampleMandateActions } from './sample-mandate-actions';

/**
 * Ce que les deux gestes du mandat d'exemple tiennent seuls, depuis qu'ils
 * sont sortis de la fiche (2026-10-23) — la fiche, elle, garde ses cas de rendu :
 *
 * - 🔴 **un échec remonte DIT** (`failed`), et un nouvel essai l'efface d'abord ;
 * - les deux boutons sont inactifs quand la page est occupée par un autre geste.
 */

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
    billingModes: [],
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

interface Wire {
  failures: (string | null)[];
  opened: number;
}

function boot(
  row: LegalEntityView,
  mandate: () => Promise<Blob>,
): { fixture: ComponentFixture<SampleMandateActions>; wire: Wire } {
  const wire: Wire = { failures: [], opened: 0 };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [SampleMandateActions],
    providers: [
      { provide: LegalEntitiesService, useValue: { sampleMandate: mandate } },
      {
        provide: FoldPanelHostService,
        useValue: {
          open: () => {
            wire.opened += 1;
            return { closed: Promise.resolve(undefined) };
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(SampleMandateActions);
  fixture.componentRef.setInput('entity', row);
  fixture.componentInstance.failed.subscribe((message) => wire.failures.push(message));
  fixture.detectChanges();
  return { fixture, wire };
}

function buttons(fixture: ComponentFixture<SampleMandateActions>): HTMLButtonElement[] {
  return [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')];
}

async function settle(fixture: ComponentFixture<SampleMandateActions>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('SampleMandateActions', () => {
  it('remonte l’échec du mandat, après avoir effacé le précédent', async () => {
    const { fixture, wire } = boot(entity({ canCollect: true }), () =>
      Promise.reject(new HttpErrorResponse({ status: 503 })),
    );

    buttons(fixture)[0]?.click();
    await settle(fixture);

    expect(wire.failures[0]).toBeNull();
    expect(wire.failures).toHaveLength(2);
    expect(typeof wire.failures[1]).toBe('string');
    expect(wire.opened).toBe(0);
  });

  it('ouvre le panneau quand le mandat arrive', async () => {
    const { fixture, wire } = boot(entity({ canCollect: true }), () =>
      Promise.resolve(new Blob(['%PDF-1.4'], { type: 'application/pdf' })),
    );

    buttons(fixture)[0]?.click();
    await settle(fixture);

    expect(wire.opened).toBe(1);
    expect(wire.failures).toEqual([null]);
  });

  it('se ferme quand la page est occupée par un autre geste', () => {
    const { fixture } = boot(entity({ canCollect: true }), () => Promise.resolve(new Blob()));
    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();

    expect(buttons(fixture).every((button) => button.disabled)).toBe(true);
  });
});
