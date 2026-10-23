import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { LegalEntityView, SetCreditorAccountPayload } from '@lfd/contracts';
import { FoldInputComponent } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { LegalEntitiesService } from '../../../legal-entities.service';
import { CreditorAccountCard } from './creditor-account-card';

/**
 * Ce que la carte tient depuis qu'elle est sortie de la fiche (2026-10-23) :
 *
 * - le geste se **décrit** et remonte (`saved`), avec le RIB recopié, nettoyé,
 *   et le pays en majuscules ;
 * - 🔴 **l'IBAN ne se vide qu'après un succès** ; une relecture de la fiche ne
 *   touche jamais une saisie en cours, et un échec la garde.
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
  writes: { id: string; payload: SetCreditorAccountPayload }[];
  saved: { action: () => Promise<unknown>; said: string }[];
}

function boot(
  row: LegalEntityView,
  fail = false,
): {
  fixture: ComponentFixture<CreditorAccountCard>;
  wire: Wire;
} {
  const wire: Wire = { writes: [], saved: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CreditorAccountCard],
    providers: [
      {
        provide: LegalEntitiesService,
        useValue: {
          setCreditorAccount: (id: string, payload: SetCreditorAccountPayload): Promise<void> => {
            wire.writes.push({ id, payload });
            return fail ? Promise.reject(new Error('refusé')) : Promise.resolve();
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(CreditorAccountCard);
  fixture.componentRef.setInput('entity', row);
  fixture.componentInstance.saved.subscribe((request) => wire.saved.push(request));
  fixture.detectChanges();
  return { fixture, wire };
}

function field(fixture: ComponentFixture<CreditorAccountCard>, label: string): FoldInputComponent {
  const found = fixture.debugElement
    .queryAll(By.directive(FoldInputComponent))
    .find((debug) => (debug.nativeElement as HTMLElement).getAttribute('label') === label);
  if (found === undefined) {
    throw new Error(`Champ « ${label} » absent.`);
  }
  return found.componentInstance as FoldInputComponent;
}

function saveButton(fixture: ComponentFixture<CreditorAccountCard>): HTMLButtonElement {
  const button = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(
    (candidate) => (candidate.textContent ?? '').includes('Enregistrer'),
  );
  if (button === undefined) {
    throw new Error('Bouton « Enregistrer » absent.');
  }
  return button;
}

const RECORDED: Partial<LegalEntityView> = {
  creditorBic: 'CEPAFRPP751',
  creditorAccountHolder: 'Crazeativity',
  creditorAccountLine1: 'Route de la Balme',
  creditorAccountPostalCode: '73150',
  creditorAccountCity: 'Val d’Isère',
  creditorAccountCountryCode: 'FR',
  creditorAccountLast4: '2606',
};

describe('CreditorAccountCard', () => {
  it('remonte le RIB complet, nettoyé, et le pays en majuscules', async () => {
    const { fixture, wire } = boot(entity(RECORDED));
    field(fixture, 'IBAN').value.set('  FR1420041010050500013M02606 ');
    field(fixture, 'Pays').value.set('fr');
    fixture.detectChanges();

    saveButton(fixture).click();
    expect(wire.saved.map((request) => request.said)).toEqual(['Compte enregistré.']);
    await wire.saved[0]?.action();

    expect(wire.writes).toEqual([
      {
        id: 'le1',
        payload: {
          iban: 'FR1420041010050500013M02606',
          bic: 'CEPAFRPP751',
          holder: 'Crazeativity',
          line1: 'Route de la Balme',
          line2: '',
          postalCode: '73150',
          city: 'Val d’Isère',
          countryCode: 'FR',
        },
      },
    ]);
  });

  it('ne remonte rien tant que l’IBAN manque', () => {
    const { fixture, wire } = boot(entity(RECORDED));

    expect(saveButton(fixture).disabled).toBe(true);
    saveButton(fixture).click();
    expect(wire.saved).toEqual([]);
  });

  /**
   * Régression : la fiche se relit après le geste de n'importe quelle autre
   * carte, et chaque relecture vidait l'IBAN — une saisie en cours disparaissait.
   */
  it('une relecture de la fiche effaçait l’IBAN en cours de saisie', () => {
    const { fixture } = boot(entity(RECORDED));
    field(fixture, 'IBAN').value.set('FR1420041010050500013M02606');
    field(fixture, 'BIC').value.set('AUTREBIC');
    fixture.detectChanges();

    fixture.componentRef.setInput('entity', entity({ ...RECORDED, creditorBic: 'NOUVBIC' }));
    fixture.detectChanges();

    expect(field(fixture, 'IBAN').value()).toBe('FR1420041010050500013M02606');
    expect(field(fixture, 'BIC').value()).toBe('AUTREBIC');
  });

  it('reprend la recopie de la fiche relue tant que rien n’est saisi', () => {
    const { fixture } = boot(entity(RECORDED));

    fixture.componentRef.setInput('entity', entity({ ...RECORDED, creditorBic: 'NOUVBIC' }));
    fixture.detectChanges();

    expect(field(fixture, 'BIC').value()).toBe('NOUVBIC');
  });

  it('un succès vide l’IBAN et rend la carte aux relectures', async () => {
    const { fixture, wire } = boot(entity(RECORDED));
    field(fixture, 'IBAN').value.set('FR1420041010050500013M02606');
    fixture.detectChanges();

    saveButton(fixture).click();
    await wire.saved[0]?.action();
    fixture.detectChanges();
    expect(field(fixture, 'IBAN').value()).toBe('');

    fixture.componentRef.setInput('entity', entity({ ...RECORDED, creditorBic: 'NOUVBIC' }));
    fixture.detectChanges();
    expect(field(fixture, 'BIC').value()).toBe('NOUVBIC');
  });

  it('un échec garde la saisie', async () => {
    const { fixture, wire } = boot(entity(RECORDED), true);
    field(fixture, 'IBAN').value.set('FR1420041010050500013M02606');
    field(fixture, 'BIC').value.set('AUTREBIC');
    fixture.detectChanges();

    saveButton(fixture).click();
    await expect(wire.saved[0]?.action()).rejects.toThrow('refusé');
    fixture.componentRef.setInput('entity', entity({ ...RECORDED }));
    fixture.detectChanges();

    expect(field(fixture, 'IBAN').value()).toBe('FR1420041010050500013M02606');
    expect(field(fixture, 'BIC').value()).toBe('AUTREBIC');
  });
});
