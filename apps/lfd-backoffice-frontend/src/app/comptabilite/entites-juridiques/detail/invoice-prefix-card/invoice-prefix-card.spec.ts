import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { LegalEntityView, SetInvoicePrefixPayload } from '@lfd/contracts';
import { FoldInputComponent } from 'fold-ng';
import { beforeEach, describe, expect, it } from 'vitest';

import { LegalEntitiesService } from '../../../legal-entities.service';
import { InvoicePrefixCard } from './invoice-prefix-card';

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
    invoicePrefix: null,
    invoicePrefixFrozen: false,
    ...over,
  };
}

interface Wire {
  prefixes: { id: string; payload: SetInvoicePrefixPayload }[];
  saved: { action: () => Promise<unknown>; said: string }[];
}

let wire: Wire;

function boot(over: Partial<LegalEntityView> = {}): ComponentFixture<InvoicePrefixCard> {
  wire = { prefixes: [], saved: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [InvoicePrefixCard],
    providers: [
      {
        provide: LegalEntitiesService,
        useValue: {
          setInvoicePrefix: (id: string, payload: SetInvoicePrefixPayload) => {
            wire.prefixes.push({ id, payload });
            return Promise.resolve();
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(InvoicePrefixCard);
  fixture.componentRef.setInput('entity', entity(over));
  fixture.componentInstance.saved.subscribe((request) => wire.saved.push(request));
  fixture.detectChanges();
  return fixture;
}

const root = (fixture: ComponentFixture<InvoicePrefixCard>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

const PREFIX = 'Préfixe des factures';

function field(fixture: ComponentFixture<InvoicePrefixCard>): FoldInputComponent | undefined {
  return fixture.debugElement
    .queryAll(By.directive(FoldInputComponent))
    .map((node) => node.componentInstance as FoldInputComponent)
    .find((input) => input.label() === PREFIX);
}

function type(fixture: ComponentFixture<InvoicePrefixCard>, value: string): void {
  fixture.debugElement
    .queryAll(By.directive(FoldInputComponent))
    .find((node) => (node.componentInstance as FoldInputComponent).label() === PREFIX)
    ?.triggerEventHandler('valueChange', value);
  fixture.detectChanges();
}

function save(fixture: ComponentFixture<InvoicePrefixCard>): HTMLButtonElement | undefined {
  return [...root(fixture).querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => (node.textContent ?? '').trim() === 'Enregistrer',
  );
}

describe('InvoicePrefixCard — la numérotation des factures (lot ZA)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('sans préfixe : le dit, champ vide, enregistrement impossible à vide', () => {
    const fixture = boot();

    expect(root(fixture).querySelector('[data-invoice-prefix-missing]')?.textContent).toContain(
      'ne peut pas émettre',
    );
    expect(field(fixture)?.value()).toBe('');
    expect(save(fixture)?.disabled).toBe(true);
  });

  it('montre le numéro tel qu’il s’imprimera, en majuscules, et enregistre ce qui est tapé', async () => {
    const fixture = boot();
    type(fixture, 'lfd');

    expect(root(fixture).querySelector('[data-invoice-prefix-preview]')?.textContent).toContain(
      'FA-LFD-AAAA-000001',
    );
    save(fixture)?.click();
    await wire.saved[0]?.action();

    expect(wire.prefixes).toEqual([{ id: 'le1', payload: { prefix: 'lfd' } }]);
    expect(wire.saved[0]?.said).toBe('Préfixe de numéro enregistré.');
  });

  it('posé mais libre : relu dans le champ, sans signalement', () => {
    const fixture = boot({ invoicePrefix: 'LFD' });

    expect(field(fixture)?.value()).toBe('LFD');
    expect(root(fixture).querySelector('[data-invoice-prefix-missing]')).toBeNull();
  });

  it('figé après la première facture : plus de champ ni de bouton, et le dit', () => {
    const fixture = boot({ invoicePrefix: 'LFD', invoicePrefixFrozen: true });

    const frozen = root(fixture).querySelector('[data-invoice-prefix-frozen]');
    expect(frozen?.textContent).toContain('FA-LFD-AAAA-000001');
    expect(frozen?.textContent).toContain('figé');
    expect(root(fixture).textContent).toContain('déclarez une seconde entité juridique');
    expect(field(fixture)?.value()).toBe('LFD');
    expect(save(fixture)).toBeUndefined();
  });
});
