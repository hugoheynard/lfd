import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type {
  LegalEntityView,
  SetAutoCollectionPayload,
  SetCollectionSchedulePayload,
  SetPreNotificationPayload,
} from '@lfd/contracts';
import { FoldTimeComponent, FoldNumberInputComponent } from 'fold-ng';
import { beforeEach, describe, expect, it } from 'vitest';

import { LegalEntitiesService } from '../../../legal-entities.service';
import { CollectionSettingsCard } from './collection-settings-card';

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
  schedules: { id: string; payload: SetCollectionSchedulePayload }[];
  autos: { id: string; payload: SetAutoCollectionPayload }[];
  /** Tous les appels, dans l'ordre — l'ordre est la garantie. */
  calls: string[];
  notices: { id: string; payload: SetPreNotificationPayload }[];
  saved: { action: () => Promise<unknown>; said: string }[];
}

let wire: Wire;

function boot(over: Partial<LegalEntityView> = {}): ComponentFixture<CollectionSettingsCard> {
  wire = { schedules: [], autos: [], saved: [], calls: [], notices: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CollectionSettingsCard],
    providers: [
      {
        provide: LegalEntitiesService,
        useValue: {
          setCollectionSchedule: (id: string, payload: SetCollectionSchedulePayload) => {
            wire.schedules.push({ id, payload });
            wire.calls.push('schedule');
            return Promise.resolve();
          },
          setPreNotification: (id: string, payload: SetPreNotificationPayload) => {
            wire.notices.push({ id, payload });
            wire.calls.push('notice');
            return Promise.resolve();
          },
          setAutoCollection: (id: string, payload: SetAutoCollectionPayload) => {
            wire.autos.push({ id, payload });
            return Promise.resolve();
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(CollectionSettingsCard);
  fixture.componentRef.setInput('entity', entity(over));
  fixture.componentInstance.saved.subscribe((request) => wire.saved.push(request));
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<CollectionSettingsCard>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

function numberInput(
  fixture: ComponentFixture<CollectionSettingsCard>,
  label: string,
): ReturnType<ComponentFixture<CollectionSettingsCard>['debugElement']['query']> {
  const found = fixture.debugElement
    .queryAll(By.directive(FoldNumberInputComponent))
    .find((node) => (node.componentInstance as FoldNumberInputComponent).label() === label);
  if (found === undefined) {
    throw new Error(`Le champ « ${label} » est absent.`);
  }
  return found;
}

function type(
  fixture: ComponentFixture<CollectionSettingsCard>,
  label: string,
  value: number | null,
): void {
  numberInput(fixture, label).triggerEventHandler('valueChange', value);
  fixture.detectChanges();
}

function typeTime(fixture: ComponentFixture<CollectionSettingsCard>, value: string): void {
  fixture.debugElement
    .query(By.directive(FoldTimeComponent))
    .triggerEventHandler('valueChange', value);
  fixture.detectChanges();
}

function button(
  fixture: ComponentFixture<CollectionSettingsCard>,
  label: string,
): HTMLButtonElement {
  const found = [
    ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
  ].find((node) => (node.textContent ?? '').trim() === label);
  if (found === undefined) {
    throw new Error(`Le bouton « ${label} » est absent.`);
  }
  return found;
}

const DAYS = 'Délai de notification (jours entre la clôture et le prélèvement)';
const CUTOFF_DAYS = 'Jours ouvrés bancaires avant le prélèvement';

describe('CollectionSettingsCard — le prélèvement automatique', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('affiche la frise du mois calculée par le serveur, et « à renseigner » sans limite de dépôt', () => {
    const fixture = boot();

    expect(text(fixture)).toContain('La période se clôt');
    expect(text(fixture)).toContain('Vos clients sont prélevés');
    expect(text(fixture)).toContain('16 nov. 2026');
    expect(text(fixture)).toContain('à renseigner');
  });

  it('ne dit plus « branchée prochainement », et montre la dernière tentative', () => {
    const fixture = boot({
      autoCollectionEnabled: true,
      lastAutopilotRun: {
        cycleClosesAt: '2026-09-30T22:00:00.000Z',
        ranAt: '2026-09-30T23:15:00.000Z',
        outcome: 'constituted',
        message: null,
      },
    });

    expect(text(fixture)).not.toContain('branchée');
    expect(text(fixture)).toContain('Lot préparé automatiquement le');
    expect(text(fixture)).toContain('lot de la clôture du 1er octobre 2026');
  });

  it('jamais tentée : aucun encadré de tentative', () => {
    const fixture = boot({ autoCollectionEnabled: true });

    expect((fixture.nativeElement as HTMLElement).querySelector('[data-autopilot-run]')).toBeNull();
  });

  it('un seul champ de jours, nommé « Délai de notification », borné à 3 au moins', () => {
    const fixture = boot();
    const days = fixture.debugElement
      .queryAll(By.directive(FoldNumberInputComponent))
      .map((node) => (node.componentInstance as FoldNumberInputComponent).label())
      .filter((label) => (label ?? '').includes('jours') && !(label ?? '').includes('ouvrés'));

    expect(days).toEqual([DAYS]);
    expect((numberInput(fixture, DAYS).componentInstance as FoldNumberInputComponent).min()).toBe(
      3,
    );
  });

  it('montre le délai effectif, l’exemple en direct, et plus jamais « plus court que le délai d’avis »', () => {
    const fixture = boot({ collectionDaysAfterClosure: 20 });
    expect((numberInput(fixture, DAYS).componentInstance as FoldNumberInputComponent).value()).toBe(
      20,
    );

    type(fixture, DAYS, 9);
    expect(text(fixture)).toContain('clôture le 1er + 9 jours');
    expect(text(fixture)).toContain('prélèvement le 10');
    expect(text(fixture)).not.toContain('délai d’avis');
    expect(text(fixture)).not.toContain("délai d'avis");
    expect(text(fixture)).not.toContain("l'enregistrement sera refusé");
  });

  it('une entité réglée à 2 jours se lit, mais ne se réenregistre pas sans passer à 3', () => {
    const fixture = boot({ preNotificationDays: 2 });

    expect(button(fixture, 'Enregistrer').disabled).toBe(true);
    type(fixture, DAYS, 3);
    expect(button(fixture, 'Enregistrer').disabled).toBe(false);
  });

  it('affiche la date limite de dépôt quand elle est renseignée', () => {
    const fixture = boot({
      depositCutoff: { businessDaysBefore: 2, time: '16:00' },
      nextCollection: {
        closesAt: '2026-10-31T23:00:00.000Z',
        plannedConstitutionAt: '2026-11-01T00:00:00.000Z',
        collectionDay: '2026-11-16',
        depositDeadline: { day: '2026-11-12', time: '16:00' },
        tightDepositMargin: null,
      },
    });

    expect(text(fixture)).toContain('avant le 12 nov. 2026 à 16:00');
  });

  it('avertit quand le serveur compte moins de deux jours ouvrés avant la limite — 0 compris', () => {
    const tight = (margin: number | null) =>
      boot({
        nextCollection: {
          closesAt: '2026-10-31T23:00:00.000Z',
          plannedConstitutionAt: '2026-11-01T00:00:00.000Z',
          collectionDay: '2026-11-03',
          depositDeadline: { day: '2026-11-02', time: '13:45' },
          tightDepositMargin: margin,
        },
      });
    const warned = (margin: number | null) =>
      (tight(margin).nativeElement as HTMLElement).querySelector('[data-tight-margin]');

    expect(warned(0)?.textContent).toContain('il ne reste aucun jour ouvré');
    TestBed.resetTestingModule();
    expect(warned(1)?.textContent).toContain('il ne reste qu’un jour ouvré');
    TestBed.resetTestingModule();
    expect(warned(null)).toBeNull();
  });

  it('enregistre : échéance remise au délai PUIS délai réglé, cut-off compris', async () => {
    const fixture = boot({ collectionDaysAfterClosure: 10 });
    type(fixture, DAYS, 20);
    type(fixture, CUTOFF_DAYS, 2);
    typeTime(fixture, '16:00');

    button(fixture, 'Enregistrer').click();
    await wire.saved[0]?.action();

    expect(wire.calls).toEqual(['schedule', 'notice']);
    expect(wire.schedules).toEqual([
      {
        id: 'le1',
        payload: {
          delayHours: 1,
          daysAfterClosure: null,
          depositCutoff: { businessDaysBefore: 2, time: '16:00' },
        },
      },
    ]);
    expect(wire.notices).toEqual([{ id: 'le1', payload: { days: 20 } }]);
  });

  it('un délai inchangé ne se réécrit pas : seul le calendrier part', async () => {
    const fixture = boot({ collectionDaysAfterClosure: 20 });
    type(fixture, DAYS, 14);

    button(fixture, 'Enregistrer').click();
    await wire.saved[0]?.action();

    expect(wire.calls).toEqual(['schedule']);
    expect(wire.schedules[0]?.payload.daysAfterClosure).toBeNull();
  });

  it('refuse d’enregistrer un cut-off à moitié saisi, et le dit', () => {
    const fixture = boot();
    type(fixture, CUTOFF_DAYS, 2);

    expect(button(fixture, 'Enregistrer').disabled).toBe(true);
    expect(text(fixture)).toContain('Renseignez le nombre de jours ET l’heure');
  });

  it('le bouton de l’automatisme dit ce qu’il fera, et l’écrit par sa propre route', async () => {
    const fixture = boot({ autoCollectionEnabled: true });

    button(fixture, 'Désactiver').click();
    await wire.saved[0]?.action();

    expect(wire.autos).toEqual([{ id: 'le1', payload: { enabled: false } }]);
    expect(wire.saved[0]?.said).toBe('Prélèvement automatique désactivé.');
  });

  it('la section « Limite de dépôt à la banque » porte l’ancre des liens « Régler »', () => {
    const fixture = boot();
    const section = (fixture.nativeElement as HTMLElement).querySelector('#limite-de-depot');

    expect(section?.getAttribute('aria-labelledby')).toBe('cs-deposit-title');
    expect(section?.querySelector('#cs-deposit-title')?.textContent).toContain(
      'Limite de dépôt à la banque',
    );
  });

  it('l’heure limite est un contrôle d’heure, et part au service en « HH:MM » même avec des secondes', async () => {
    const fixture = boot();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('fold-time input')?.getAttribute('type'),
    ).toBe('time');
    type(fixture, DAYS, 20);
    type(fixture, CUTOFF_DAYS, 2);
    typeTime(fixture, '13:45:00');

    button(fixture, 'Enregistrer').click();
    await wire.saved[0]?.action();

    expect(wire.schedules[0]?.payload.depositCutoff).toEqual({
      businessDaysBefore: 2,
      time: '13:45',
    });
  });
});
