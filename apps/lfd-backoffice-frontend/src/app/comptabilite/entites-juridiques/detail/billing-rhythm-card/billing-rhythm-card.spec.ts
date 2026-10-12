import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { LegalEntityView, SetBillingRhythmPayload } from '@lfd/contracts';
import {
  FoldInlineConfirmComponent,
  FoldListboxComponent,
  FoldNumberInputComponent,
} from 'fold-ng';
import { beforeEach, describe, expect, it } from 'vitest';

import { LegalEntitiesService } from '../../../legal-entities.service';
import { BillingRhythmCard } from './billing-rhythm-card';

/** Les dates ne sont comparées qu'entre elles, jamais à l'horloge. */
const NOV_1 = '2026-10-31T23:00:00.000Z';
const NOV_2 = '2026-11-01T23:00:00.000Z';

const CLOSURES: LegalEntityView['upcomingClosures'] = [
  { closesAt: NOV_1, periodLabel: 'du 1er au 31 octobre 2026', invoicedOn: '2026-10-31' },
  {
    closesAt: '2026-11-30T23:00:00.000Z',
    periodLabel: 'du 1er au 30 novembre 2026',
    invoicedOn: '2026-11-30',
  },
  {
    closesAt: '2026-12-31T23:00:00.000Z',
    periodLabel: 'du 1er au 31 décembre 2026',
    invoicedOn: '2026-12-31',
  },
  {
    closesAt: '2027-01-31T23:00:00.000Z',
    periodLabel: 'du 1er au 31 janvier 2027',
    invoicedOn: '2027-01-31',
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
    billingRhythm: { kind: 'monthly', days: [1] },
    nextBillingRhythm: null,
    billingRhythmChangeLock: null,
    upcomingClosures: [],
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
  rhythms: { id: string; payload: SetBillingRhythmPayload }[];
  saved: { action: () => Promise<unknown>; said: string }[];
}

let wire: Wire;

function boot(over: Partial<LegalEntityView> = {}): ComponentFixture<BillingRhythmCard> {
  wire = { rhythms: [], saved: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [BillingRhythmCard],
    providers: [
      {
        provide: LegalEntitiesService,
        useValue: {
          setBillingRhythm: (id: string, payload: SetBillingRhythmPayload) => {
            wire.rhythms.push({ id, payload });
            return Promise.resolve();
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(BillingRhythmCard);
  fixture.componentRef.setInput('entity', entity({ upcomingClosures: CLOSURES, ...over }));
  fixture.componentInstance.saved.subscribe((request) => wire.saved.push(request));
  fixture.detectChanges();
  return fixture;
}

const PENDING: Partial<LegalEntityView> = {
  nextBillingRhythm: { kind: 'semimonthly', days: [1, 16], effectiveAt: NOV_1 },
  billingRhythmChangeLock: {
    effectiveAt: NOV_1,
    unlocksAfterInvoiceOn: '2026-10-31',
    canCancel: true,
  },
};

const text = (fixture: ComponentFixture<BillingRhythmCard>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

function listbox(fixture: ComponentFixture<BillingRhythmCard>, label: string) {
  const found = fixture.debugElement
    .queryAll(By.directive(FoldListboxComponent))
    .find((node) => (node.componentInstance as FoldListboxComponent<unknown>).label() === label);
  if (found === undefined) {
    throw new Error(`La liste « ${label} » est absente.`);
  }
  return found;
}

function numberLabels(fixture: ComponentFixture<BillingRhythmCard>): (string | undefined)[] {
  return fixture.debugElement
    .queryAll(By.directive(FoldNumberInputComponent))
    .map((node) => (node.componentInstance as FoldNumberInputComponent).label());
}

function numberValues(fixture: ComponentFixture<BillingRhythmCard>): (number | null)[] {
  return fixture.debugElement
    .queryAll(By.directive(FoldNumberInputComponent))
    .map((node) => (node.componentInstance as FoldNumberInputComponent).value());
}

function choose(fixture: ComponentFixture<BillingRhythmCard>, label: string, value: unknown): void {
  listbox(fixture, label).triggerEventHandler('valueChange', value);
  fixture.detectChanges();
}

const confirms = (fixture: ComponentFixture<BillingRhythmCard>) =>
  fixture.debugElement.queryAll(By.directive(FoldInlineConfirmComponent));

const saveButton = (fixture: ComponentFixture<BillingRhythmCard>): HTMLButtonElement | null =>
  (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-rhythm-save]');

describe('BillingRhythmCard — le rythme de facturation', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('dit le rythme en vigueur, la règle du changement unique, et trois clôtures seulement', () => {
    const fixture = boot();

    expect(text(fixture)).toContain('Chaque mois, clôture le 1er.');
    expect(text(fixture)).toContain(
      'le nouveau rythme prend effet à la prochaine clôture, et le suivant ne sera possible',
    );
    expect(text(fixture)).toContain('Période du 1er au 31 octobre 2026 — facturée le 31 oct. 2026');
    expect(text(fixture)).toContain('du 1er au 31 décembre 2026');
    expect(text(fixture)).not.toContain('janvier 2027');
    expect(text(fixture)).toContain('sa facture part la veille à 23h55');
  });

  it('rien à enregistrer tant que la saisie redit le rythme en vigueur', () => {
    const fixture = boot();

    expect(saveButton(fixture)?.disabled).toBe(true);
  });

  it('bascule les champs de date selon le rythme, avec leurs défauts', () => {
    const fixture = boot();
    expect(numberLabels(fixture)).toEqual(['Jour de clôture (1 à 28)']);

    choose(fixture, 'Rythme', 'semimonthly');
    expect(numberValues(fixture)).toEqual([1, 16]);

    choose(fixture, 'Rythme', 'weekly');
    expect(numberLabels(fixture)).toEqual([]);
    expect(
      (
        listbox(fixture, 'Jour de clôture').componentInstance as FoldListboxComponent<number>
      ).value(),
    ).toBe(1);
  });

  it('deux jours identiques : refusé avant l’envoi, et dit', () => {
    const fixture = boot();
    choose(fixture, 'Rythme', 'semimonthly');
    fixture.debugElement
      .queryAll(By.directive(FoldNumberInputComponent))[1]
      ?.triggerEventHandler('valueChange', 1);
    fixture.detectChanges();

    expect(saveButton(fixture)?.disabled).toBe(true);
    expect(text(fixture)).toContain('Les deux jours de clôture doivent être différents.');
  });

  it('la confirmation nomme la prise d’effet, puis enregistre le rythme choisi', async () => {
    const fixture = boot();
    choose(fixture, 'Rythme', 'weekly');
    choose(fixture, 'Jour de clôture', 3);

    const confirm = confirms(fixture).at(-1);
    expect((confirm?.componentInstance as FoldInlineConfirmComponent).message()).toContain(
      'prendra effet à la clôture du 1er novembre 2026',
    );
    expect(saveButton(fixture)?.disabled).toBe(false);
    confirm?.triggerEventHandler('confirmed', '');
    await wire.saved[0]?.action();

    expect(wire.rhythms).toEqual([{ id: 'le1', payload: { kind: 'weekly', days: [3] } }]);
  });

  it('verrouillé : le formulaire se ferme et dit quand il rouvrira', () => {
    const fixture = boot(PENDING);

    expect(text(fixture)).toContain(
      'un nouveau rythme sera possible après la facture du 31 oct. 2026',
    );
    expect(text(fixture)).toContain('Deux fois par mois, clôtures le 1er et le 16, à partir de');
    expect(
      (listbox(fixture, 'Rythme').componentInstance as FoldListboxComponent<string>).disabled(),
    ).toBe(true);
    expect(saveButton(fixture)?.disabled).toBe(true);
  });

  it('verrouillé, un geste forcé n’envoie rien', () => {
    const fixture = boot(PENDING);
    choose(fixture, 'Rythme', 'weekly');
    confirms(fixture).at(-1)?.triggerEventHandler('confirmed', '');

    expect(wire.saved).toEqual([]);
  });

  it('annuler le programmé renvoie le rythme en vigueur', async () => {
    const fixture = boot(PENDING);

    confirms(fixture)[0]?.triggerEventHandler('confirmed', '');
    await wire.saved[0]?.action();

    expect(wire.rhythms).toEqual([{ id: 'le1', payload: { kind: 'monthly', days: [1] } }]);
    expect(wire.saved[0]?.said).toBe('Changement de rythme annulé.');
  });

  it('la prise d’effet atteinte : plus d’annulation possible', () => {
    const fixture = boot({
      ...PENDING,
      billingRhythmChangeLock: {
        effectiveAt: NOV_1,
        unlocksAfterInvoiceOn: '2026-10-31',
        canCancel: false,
      },
    });

    expect(text(fixture)).not.toContain('Annuler ce changement');
  });

  it('une première période d’un jour après la bascule se signale', () => {
    const fixture = boot({
      ...PENDING,
      upcomingClosures: [
        { closesAt: NOV_1, periodLabel: 'du 1er au 31 octobre 2026', invoicedOn: '2026-10-31' },
        { closesAt: NOV_2, periodLabel: 'du 1er au 1er novembre 2026', invoicedOn: '2026-11-01' },
      ],
    });

    expect(text(fixture)).toContain('ne dure qu’un seul jour');
  });
});
