import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type {
  ProductionTrackingLevel,
  ProductionTrackingPayload,
  ProductionTrackingView,
  StaffPermission,
  WorkstationsPageView,
} from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { PackingSettingsService } from '../../../production/packing-settings.service';
import { ProductionSettingsService } from '../../../production/production-settings.service';
import { WorkstationsService } from '../../../production/workstations.service';
import { TrackingLevelsPage } from './tracking-levels-page';

/**
 * La page « Niveau de suivi » : le niveau du fournil part chez l'atelier, le
 * niveau d'un poste chez les postes, chacun sous sa clé d'intention ; « suit
 * le fournil » s'écrit `null` ; tant que la mise en service n'est pas passée,
 * la page le dit.
 */

const TRACKING: ProductionTrackingView = {
  level: 'always_green',
  marginMinutes: 15,
  inServiceSince: '2027-01-01T00:00:00.000Z',
  inService: true,
};

class FakeSettings {
  view: ProductionTrackingView = TRACKING;
  readonly saved: { readonly payload: ProductionTrackingPayload; readonly key: string }[] = [];

  tracking(): Promise<ProductionTrackingView> {
    return Promise.resolve(this.view);
  }

  saveTracking(payload: ProductionTrackingPayload, key: string): Promise<void> {
    this.saved.push({ payload, key });
    this.view = { ...this.view, ...payload };
    return Promise.resolve();
  }
}

class FakeStations {
  level: ProductionTrackingLevel | null = null;
  readonly set: {
    readonly id: string;
    readonly level: ProductionTrackingLevel | null;
    readonly key: string;
  }[] = [];

  page(): Promise<WorkstationsPageView> {
    return Promise.resolve({
      workstations: [{ id: 'ws_pat', name: 'Pâtisserie', position: 1, trackingLevel: this.level }],
      products: [],
      offCatalog: [],
      unplacedCount: 0,
    });
  }

  setTrackingLevel(id: string, level: ProductionTrackingLevel | null, key: string): Promise<void> {
    this.set.push({ id, level, key });
    this.level = level;
    return Promise.resolve();
  }
}

const ALL: readonly StaffPermission[] = [
  'production_settings:read',
  'production_settings:write',
  'production_workstations:read',
  'production_workstations:write',
];

let settings: FakeSettings;
let stations: FakeStations;

async function mount(
  granted: readonly StaffPermission[] = ALL,
): Promise<{ fixture: ComponentFixture<TrackingLevelsPage>; page: TrackingLevelsPage }> {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ProductionSettingsService, useValue: settings },
      { provide: WorkstationsService, useValue: stations },
      {
        provide: PackingSettingsService,
        useValue: {
          read: () =>
            Promise.resolve({
              halfSharing: false,
              showMadeToOrder: true,
              pickupTrackingLevel: 'simple',
              source: 'default',
            }),
        },
      },
      {
        provide: PermissionsStore,
        useValue: { can: (permission: StaffPermission) => granted.includes(permission) },
      },
    ],
  });
  const fixture = TestBed.createComponent(TrackingLevelsPage);
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
  return { fixture, page: fixture.componentInstance };
}

const root = (fixture: ComponentFixture<TrackingLevelsPage>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('la page « Niveau de suivi »', () => {
  beforeEach(() => {
    settings = new FakeSettings();
    stations = new FakeStations();
  });

  it('écrit le niveau du fournil et sa marge, sous une clé d’intention, puis relit', async () => {
    const { page } = await mount();

    page['chooseLevel']('simple');
    page['margin'].set(20);
    await page['save']();

    expect(settings.saved).toHaveLength(1);
    expect(settings.saved[0]?.payload).toEqual({ level: 'simple', marginMinutes: 20 });
    expect(settings.saved[0]?.key).not.toBe('');
    expect(page['dirty']()).toBe(false);
  });

  it('rien de changé, rien à enregistrer', async () => {
    const { fixture } = await mount();

    expect(root(fixture).querySelector<HTMLButtonElement>('[data-save-tracking]')?.disabled).toBe(
      true,
    );
  });

  it('écrit le niveau d’un poste chez les postes, et « suit le fournil » en `null`', async () => {
    const { page } = await mount();
    const station = (await stations.page()).workstations[0];
    if (station === undefined) {
      throw new Error('poste absent');
    }

    await page['setStation'](station, 'detailed');
    await page['setStation']({ ...station, trackingLevel: 'detailed' }, 'inherit');

    expect(stations.set.map(({ id, level }) => ({ id, level }))).toEqual([
      { id: 'ws_pat', level: 'detailed' },
      { id: 'ws_pat', level: null },
    ]);
    expect(stations.set[0]?.key).not.toBe(stations.set[1]?.key);
  });

  it('dit que les niveaux ne s’appliquent pas encore avant la mise en service', async () => {
    settings.view = { ...TRACKING, inService: false };
    const { fixture } = await mount();

    expect(root(fixture).querySelector('[data-not-in-service]')?.textContent).toContain(
      '1 janvier 2027',
    );
  });

  it('en service, pas d’avertissement', async () => {
    const { fixture } = await mount();

    expect(root(fixture).querySelector('[data-not-in-service]')).toBeNull();
  });

  it('sans droit d’écriture, pas de bouton « Enregistrer »', async () => {
    const { fixture } = await mount(['production_settings:read', 'production_workstations:read']);

    expect(root(fixture).querySelector('[data-save-tracking]')).toBeNull();
  });

  it('montre « Colisage — retrait » à qui lit les réglages du colisage, et à lui seul', async () => {
    const { fixture } = await mount([...ALL, 'delivery_settings:read']);
    expect(root(fixture).querySelector('app-packing-pickup-level-card')).not.toBeNull();
  });

  it('sans lecture des réglages du colisage, pas de carte du colisage', async () => {
    const { fixture } = await mount();
    expect(root(fixture).querySelector('app-packing-pickup-level-card')).toBeNull();
  });
});
