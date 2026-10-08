import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type {
  LegalEntityView,
  SetAutoCollectionPayload,
  SetCollectionSchedulePayload,
} from '@lfd/contracts';
import { FoldInputComponent, FoldNumberInputComponent } from 'fold-ng';
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
    ...over,
  };
}

interface Wire {
  schedules: { id: string; payload: SetCollectionSchedulePayload }[];
  autos: { id: string; payload: SetAutoCollectionPayload }[];
  saved: { action: () => Promise<unknown>; said: string }[];
}

let wire: Wire;

function boot(over: Partial<LegalEntityView> = {}): ComponentFixture<CollectionSettingsCard> {
  wire = { schedules: [], autos: [], saved: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CollectionSettingsCard],
    providers: [
      {
        provide: LegalEntitiesService,
        useValue: {
          setCollectionSchedule: (id: string, payload: SetCollectionSchedulePayload) => {
            wire.schedules.push({ id, payload });
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
    .query(By.directive(FoldInputComponent))
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

const DAYS = 'Jours entre la clôture du mois et le prélèvement';
const CUTOFF_DAYS = 'Jours ouvrés bancaires avant le prélèvement';

describe('CollectionSettingsCard — le prélèvement automatique', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('affiche la frise du mois calculée par le serveur, et « à renseigner » sans limite de dépôt', () => {
    const fixture = boot();

    expect(text(fixture)).toContain('Le mois se clôt');
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
    expect(text(fixture)).toContain('lot de septembre');
  });

  it('jamais tentée : aucun encadré de tentative', () => {
    const fixture = boot({ autoCollectionEnabled: true });

    expect((fixture.nativeElement as HTMLElement).querySelector('[data-autopilot-run]')).toBeNull();
  });

  it('calcule l’exemple en direct depuis la saisie, et le délai d’avis quand c’est vide', () => {
    const fixture = boot();
    expect(text(fixture)).toContain('Laissé vide : 14 jours');

    type(fixture, DAYS, 9);
    expect(text(fixture)).toContain('clôture le 1er + 9 jours → prélèvement le 10');
    expect(text(fixture)).toContain("l'enregistrement sera refusé");
  });

  it('affiche la date limite de dépôt quand elle est renseignée', () => {
    const fixture = boot({
      depositCutoff: { businessDaysBefore: 2, time: '16:00' },
      nextCollection: {
        closesAt: '2026-10-31T23:00:00.000Z',
        plannedConstitutionAt: '2026-11-01T00:00:00.000Z',
        collectionDay: '2026-11-16',
        depositDeadline: { day: '2026-11-12', time: '16:00' },
      },
    });

    expect(text(fixture)).toContain('avant le 12 nov. 2026 à 16:00');
  });

  it('enregistre le calendrier saisi, cut-off compris', async () => {
    const fixture = boot();
    type(fixture, DAYS, 20);
    type(fixture, CUTOFF_DAYS, 2);
    typeTime(fixture, '16:00');

    button(fixture, 'Enregistrer').click();
    await wire.saved[0]?.action();

    expect(wire.schedules).toEqual([
      {
        id: 'le1',
        payload: {
          delayHours: 1,
          daysAfterClosure: 20,
          depositCutoff: { businessDaysBefore: 2, time: '16:00' },
        },
      },
    ]);
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
});
