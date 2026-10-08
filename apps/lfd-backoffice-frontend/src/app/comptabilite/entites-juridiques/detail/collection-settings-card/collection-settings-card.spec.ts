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

const DAYS = 'Échéance après la clôture (jours)';
const CUTOFF_DAYS = "Dépôt au plus tard (jours ouvrés avant l'échéance)";

describe('CollectionSettingsCard — le prélèvement automatique', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('affiche le calendrier calculé par le serveur, et « À renseigner » sans cut-off', () => {
    const fixture = boot();

    expect(text(fixture)).toContain('16 nov. 2026');
    expect(text(fixture)).toContain('À renseigner');
    expect(text(fixture)).toContain('Automatisme désactivé');
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

    expect(text(fixture)).toContain('12 nov. 2026 à 16:00');
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
    expect(text(fixture)).toContain('se renseignent ensemble');
  });

  it('le bouton de l’automatisme dit ce qu’il fera, et l’écrit par sa propre route', async () => {
    const fixture = boot({ autoCollectionEnabled: true });

    button(fixture, 'Désactiver').click();
    await wire.saved[0]?.action();

    expect(wire.autos).toEqual([{ id: 'le1', payload: { enabled: false } }]);
    expect(wire.saved[0]?.said).toBe('Prélèvement automatique désactivé.');
  });
});
