import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { LegalEntityView, SetBankCollectionLimitsPayload } from '@lfd/contracts';
import { FoldNumberInputComponent } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { LegalEntitiesService } from '../../../legal-entities.service';
import { BankLimitsSection } from './bank-limits-section';

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

const EMPTY = { perDebitCents: null, perRemittanceCents: null, monthlyCents: null };

interface Wire {
  sent: { id: string; payload: SetBankCollectionLimitsPayload }[];
  saved: { action: () => Promise<unknown>; said: string }[];
}
let wire: Wire;

function boot(
  b2b: LegalEntityView['bankCollectionLimits']['B2B'] = EMPTY,
): ComponentFixture<BankLimitsSection> {
  wire = { sent: [], saved: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [BankLimitsSection],
    providers: [
      {
        provide: LegalEntitiesService,
        useValue: {
          setBankCollectionLimits: (id: string, payload: SetBankCollectionLimitsPayload) => {
            wire.sent.push({ id, payload });
            return Promise.resolve();
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(BankLimitsSection);
  fixture.componentRef.setInput(
    'entity',
    entity({ bankCollectionLimits: { CORE: EMPTY, B2B: b2b } }),
  );
  fixture.componentInstance.saved.subscribe((request) => wire.saved.push(request));
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<BankLimitsSection>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

function field(fixture: ComponentFixture<BankLimitsSection>, label: string) {
  const found = fixture.debugElement
    .queryAll(By.directive(FoldNumberInputComponent))
    .find((node) => (node.componentInstance as FoldNumberInputComponent).label() === label);
  if (found === undefined) {
    throw new Error(`Le champ « ${label} » est absent.`);
  }
  return found;
}

function type(
  fixture: ComponentFixture<BankLimitsSection>,
  label: string,
  value: number | null,
): void {
  field(fixture, label).triggerEventHandler('valueChange', value);
  fixture.detectChanges();
}

async function save(fixture: ComponentFixture<BankLimitsSection>): Promise<void> {
  const button = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(
    (node) => (node.textContent ?? '').trim() === 'Enregistrer les plafonds',
  );
  button?.click();
  await wire.saved[0]?.action();
}

const DEBIT = 'Par prélèvement (€)';
const REMITTANCE = 'Par remise (€)';
const MONTHLY = 'Par mois (€)';

describe('BankLimitsSection — les plafonds de la banque', () => {
  it('dit « non renseigné » plutôt qu’une valeur inventée', () => {
    const fixture = boot();

    expect(text(fixture)).toContain('par prélèvement non renseigné');
    expect(text(fixture)).toContain('par mois non renseigné');
    expect(
      (field(fixture, DEBIT).componentInstance as FoldNumberInputComponent).value(),
    ).toBeNull();
  });

  it('relit les centimes en euros', () => {
    const fixture = boot({
      perDebitCents: 150_000,
      perRemittanceCents: null,
      monthlyCents: 5_000_000,
    });

    expect((field(fixture, DEBIT).componentInstance as FoldNumberInputComponent).value()).toBe(
      1500,
    );
    expect(text(fixture)).toContain('par remise non renseigné');
  });

  it('envoie des centimes entiers pour le schéma B2B, et null pour un champ vide — jamais 0', async () => {
    const fixture = boot({ perDebitCents: 100, perRemittanceCents: 200, monthlyCents: 300 });
    type(fixture, DEBIT, 12.34);
    type(fixture, REMITTANCE, null);
    type(fixture, MONTHLY, 50_000);

    await save(fixture);

    expect(wire.sent).toEqual([
      {
        id: 'le1',
        payload: {
          scheme: 'B2B',
          perDebitCents: 1234,
          perRemittanceCents: null,
          monthlyCents: 5_000_000,
        },
      },
    ]);
    expect(wire.saved[0]?.said).toBe('Plafonds de la banque enregistrés.');
  });

  it('avertit d’un ordre incohérent sans empêcher l’enregistrement', async () => {
    const fixture = boot();
    type(fixture, DEBIT, 2000);
    type(fixture, REMITTANCE, 1000);
    type(fixture, MONTHLY, 500);

    const warnings = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-limits-incoherence]',
    );
    expect(warnings).toHaveLength(2);
    expect(text(fixture)).toContain('dépasse le plafond par remise');
    expect(text(fixture)).toContain('dépasse le plafond mensuel');

    await save(fixture);
    expect(wire.sent).toHaveLength(1);
  });

  it('aucun avertissement quand un des deux montants comparés manque', () => {
    const fixture = boot();
    type(fixture, DEBIT, 2000);

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-limits-incoherence]'),
    ).toBeNull();
  });
});
