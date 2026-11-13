import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { LegalEntityView, SetTransferDueDaysPayload } from '@lfd/contracts';
import { FoldNumberInputComponent } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { LegalEntitiesService } from '../../../legal-entities.service';
import { TransferDueCard } from './transfer-due-card';

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
    pendingCreditorAccount: null,
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
    bankCollectionLimits: {
      CORE: { perDebitCents: null, perRemittanceCents: null, monthlyCents: null },
      B2B: { perDebitCents: null, perRemittanceCents: null, monthlyCents: null },
    },
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
    payersWithoutModeCount: 0,
    missingToCollect: [],
    invoicePaymentTerms: {
      latePenaltyRateBasisPoints: null,
      recoveryIndemnityCents: null,
      earlyPaymentDiscount: null,
    },
    missingToInvoice: [],
    invoicePrefix: 'LFD',
    invoicePrefixFrozen: false,
    transferDueDaysAfterIssue: 15,
    ...over,
  };
}

interface Wire {
  calls: { id: string; payload: SetTransferDueDaysPayload }[];
  saved: { action: () => Promise<unknown>; said: string }[];
}

let wire: Wire;

function boot(over: Partial<LegalEntityView> = {}): ComponentFixture<TransferDueCard> {
  wire = { calls: [], saved: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [TransferDueCard],
    providers: [
      {
        provide: LegalEntitiesService,
        useValue: {
          setTransferDueDays: (id: string, payload: SetTransferDueDaysPayload) => {
            wire.calls.push({ id, payload });
            return Promise.resolve();
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(TransferDueCard);
  fixture.componentRef.setInput('entity', entity(over));
  fixture.componentInstance.saved.subscribe((request) => wire.saved.push(request));
  fixture.detectChanges();
  return fixture;
}

const field = (fixture: ComponentFixture<TransferDueCard>): FoldNumberInputComponent =>
  fixture.debugElement.query(By.directive(FoldNumberInputComponent))
    .componentInstance as FoldNumberInputComponent;

function setDays(fixture: ComponentFixture<TransferDueCard>, days: number | null): void {
  fixture.debugElement
    .query(By.directive(FoldNumberInputComponent))
    .triggerEventHandler('valueChange', days);
  fixture.detectChanges();
}

const save = (fixture: ComponentFixture<TransferDueCard>): HTMLButtonElement => {
  const found = [
    ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
  ].find((node) => (node.textContent ?? '').trim() === 'Enregistrer');
  if (found === undefined) {
    throw new Error('Le bouton « Enregistrer » est absent.');
  }
  return found;
};

describe('TransferDueCard — l’échéance des factures au virement', () => {
  it('relit le réglage de l’entité, nomme le plafond et dit ce qu’il touche', () => {
    const fixture = boot({ transferDueDaysAfterIssue: 15 });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(field(fixture).value()).toBe(15);
    expect(field(fixture).hint()).toContain('Au plus 45 jours (art. L441-10 du code de commerce)');
    expect(text).toContain('une facture émise garde son échéance');
    expect(save(fixture).disabled).toBe(true);
  });

  it('enregistre le nouveau délai pour cette entité', async () => {
    const fixture = boot({ transferDueDaysAfterIssue: 15 });
    setDays(fixture, 30);

    save(fixture).click();
    await wire.saved[0]?.action();

    expect(wire.calls).toEqual([{ id: 'le1', payload: { days: 30 } }]);
    expect(wire.saved[0]?.said).toBe('Échéance des factures au virement enregistrée.');
  });

  it.each([0, 46, null])('refuse d’enregistrer %s', (days) => {
    const fixture = boot({ transferDueDaysAfterIssue: 15 });
    setDays(fixture, days);

    expect(save(fixture).disabled).toBe(true);
    save(fixture).click();
    expect(wire.saved).toEqual([]);
  });

  it('accepte les deux bornes, 1 et 45', () => {
    const fixture = boot({ transferDueDaysAfterIssue: 15 });
    for (const days of [1, 45]) {
      setDays(fixture, days);
      expect(save(fixture).disabled).toBe(false);
    }
  });
});
