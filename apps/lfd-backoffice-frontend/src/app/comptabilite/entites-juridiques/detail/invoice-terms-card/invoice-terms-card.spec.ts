import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { LegalEntityView, SetInvoicePaymentTermsPayload } from '@lfd/contracts';
import { FoldInputComponent } from 'fold-ng';
import { beforeEach, describe, expect, it } from 'vitest';

import { LegalEntitiesService } from '../../../legal-entities.service';
import { InvoiceTermsCard } from './invoice-terms-card';

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

interface Wire {
  terms: { id: string; payload: SetInvoicePaymentTermsPayload }[];
  saved: { action: () => Promise<unknown>; said: string }[];
}

let wire: Wire;

function boot(over: Partial<LegalEntityView> = {}): ComponentFixture<InvoiceTermsCard> {
  wire = { terms: [], saved: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [InvoiceTermsCard],
    providers: [
      {
        provide: LegalEntitiesService,
        useValue: {
          setInvoicePaymentTerms: (id: string, payload: SetInvoicePaymentTermsPayload) => {
            wire.terms.push({ id, payload });
            return Promise.resolve();
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(InvoiceTermsCard);
  fixture.componentRef.setInput('entity', entity(over));
  fixture.componentInstance.saved.subscribe((request) => wire.saved.push(request));
  fixture.detectChanges();
  return fixture;
}

const root = (fixture: ComponentFixture<InvoiceTermsCard>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

function input(fixture: ComponentFixture<InvoiceTermsCard>, label: string): FoldInputComponent {
  const found = fixture.debugElement
    .queryAll(By.directive(FoldInputComponent))
    .find((node) => (node.componentInstance as FoldInputComponent).label() === label);
  if (found === undefined) {
    throw new Error(`Le champ « ${label} » est absent.`);
  }
  return found.componentInstance as FoldInputComponent;
}

function type(fixture: ComponentFixture<InvoiceTermsCard>, label: string, value: string): void {
  fixture.debugElement
    .queryAll(By.directive(FoldInputComponent))
    .find((node) => (node.componentInstance as FoldInputComponent).label() === label)
    ?.triggerEventHandler('valueChange', value);
  fixture.detectChanges();
}

function button(fixture: ComponentFixture<InvoiceTermsCard>, label: string): HTMLButtonElement {
  const found = [...root(fixture).querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => (node.textContent ?? '').trim() === label,
  );
  if (found === undefined) {
    throw new Error(`Le bouton « ${label} » est absent.`);
  }
  return found;
}

const ECB = 'Taux BCE de référence (%)';
const RATE = 'Taux des pénalités de retard (%)';
const INDEMNITY = 'Indemnité forfaitaire de recouvrement (€)';
const DISCOUNT = 'Escompte pour paiement anticipé';

describe('InvoiceTermsCard — les mentions de la facture', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('à renseigner : champs vides, aucun taux posé d’office, aucune suggestion sans taux BCE', () => {
    const fixture = boot();

    expect(input(fixture, RATE).value()).toBe('');
    expect(input(fixture, INDEMNITY).value()).toBe('');
    expect(input(fixture, DISCOUNT).value()).toBe('');
    expect(root(fixture).querySelector('[data-invoice-terms-suggestion]')).toBeNull();
    expect(root(fixture).textContent).toContain('majoré de 10 points');
  });

  it('propose BCE + 10 points, libellé « suggestion », et ne le reprend que sur demande', () => {
    const fixture = boot();

    type(fixture, ECB, '4,15');
    const suggestion = root(fixture).querySelector('[data-invoice-terms-suggestion]');
    expect(suggestion?.textContent).toContain('suggestion');
    expect(suggestion?.textContent).toContain('14,15');
    expect(input(fixture, RATE).value()).toBe('');

    button(fixture, 'Reprendre la suggestion').click();
    fixture.detectChanges();
    expect(input(fixture, RATE).value()).toBe('14,15');
  });

  it('enregistre en points de base et en centimes ; un champ vide part « à renseigner »', async () => {
    const fixture = boot();
    type(fixture, RATE, '14,15');
    type(fixture, INDEMNITY, '40');

    button(fixture, 'Enregistrer').click();
    await wire.saved[0]?.action();

    expect(wire.terms).toEqual([
      {
        id: 'le1',
        payload: {
          latePenaltyRateBasisPoints: 1415,
          recoveryIndemnityCents: 4000,
          earlyPaymentDiscount: null,
        },
      },
    ]);
    expect(wire.saved[0]?.said).toBe('Mentions de la facture enregistrées.');
  });

  it('refuse d’enregistrer un taux illisible, et le dit', () => {
    const fixture = boot();
    type(fixture, RATE, '14,155');

    expect(root(fixture).querySelector('[data-invoice-terms-unreadable]')).not.toBeNull();
    expect(button(fixture, 'Enregistrer').disabled).toBe(true);
  });

  it('relit les mentions en place', () => {
    const fixture = boot({
      invoicePaymentTerms: {
        latePenaltyRateBasisPoints: 1_000,
        recoveryIndemnityCents: 4_000,
        earlyPaymentDiscount: 'néant',
      },
    });

    expect(input(fixture, RATE).value()).toBe('10');
    expect(input(fixture, INDEMNITY).value()).toBe('40,00');
    expect(input(fixture, DISCOUNT).value()).toBe('néant');
  });

  it('liste ce qui manque, tel que le serveur l’a rédigé', () => {
    const missing = 'Les mentions de paiement ne sont pas renseignées (le taux…)';
    const fixture = boot({ missingToInvoice: [missing] });

    const callout = root(fixture).querySelector('[data-invoice-terms-missing]');
    expect(callout?.textContent).toContain('ne pourrait pas être émise');
    expect(callout?.textContent).toContain(missing);
  });

  it('rien ne manque : aucun signalement', () => {
    expect(root(boot()).querySelector('[data-invoice-terms-missing]')).toBeNull();
  });
});
