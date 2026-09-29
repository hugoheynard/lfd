import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  DeliveryRoutingSettingsView,
  DeliverySimulationPayload,
  DeliverySimulationView,
  StaffPermission,
  VehiclesView,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { DeliveryRoutingService } from '../delivery-routing.service';
import { DeliverySettingsService } from '../delivery-settings.service';
import { SimulatorPage } from './simulator-page';

const SETTINGS: DeliveryRoutingSettingsView = {
  detourPercent: 140,
  averageSpeedKmh: 35,
  earliestDeparture: '07:00',
  maxRoundMinutes: 240,
  stopMinutes: 5,
  defaultMode: 'insert',
  multiplePassages: false,
  source: 'explicit',
};

const FLEET: VehiclesView = {
  vehicles: [
    { id: 'v1', name: 'Kangoo', plate: 'AA-123-AA', retiredAt: null, createdAt: '' },
    { id: 'v2', name: 'Ancien', plate: 'BB-123-BB', retiredAt: '2026-01-01', createdAt: '' },
  ],
};

const VIEW: DeliverySimulationView = {
  estimate: 'crow_flies',
  departure: { label: 'Labo', lat: 45.44, lng: 6.98 },
  rounds: [
    {
      vehicleName: 'Kangoo',
      passage: 1,
      departureTime: '07:00',
      returnTime: '09:10',
      meters: 42_000,
      minutes: 130,
      overDuration: false,
      stops: [
        {
          stopId: 'arret-1',
          label: 'Arrêt La Daille',
          arrival: '07:20',
          window: { start: null, end: '07:10' },
          windowMissed: true,
        },
      ],
    },
  ],
  overflow: [{ stopId: 'arret-6', label: 'Arrêt La Rosière' }],
};

interface Wire {
  sent: DeliverySimulationPayload[];
  refuse: string | null;
}

let wire: Wire;

async function boot(
  grants: readonly StaffPermission[] = ['delivery_rounds:read', 'delivery_settings:read'],
): Promise<ComponentFixture<SimulatorPage>> {
  wire = { sent: [], refuse: null };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [SimulatorPage],
    providers: [
      {
        provide: DeliverySettingsService,
        useValue: { vehicles: () => Promise.resolve(FLEET) } satisfies Pick<
          DeliverySettingsService,
          'vehicles'
        >,
      },
      {
        provide: DeliveryRoutingService,
        useValue: {
          settings: () => Promise.resolve(SETTINGS),
          simulate: (payload: DeliverySimulationPayload) => {
            wire.sent.push(payload);
            return wire.refuse === null
              ? Promise.resolve(VIEW)
              : Promise.reject(
                  new HttpErrorResponse({ status: 400, error: { message: wire.refuse } }),
                );
          },
        } satisfies Pick<DeliveryRoutingService, 'settings' | 'simulate'>,
      },
      {
        provide: PermissionsStore,
        useValue: { can: (permission: StaffPermission) => grants.includes(permission) },
      },
      { provide: NotifyService, useValue: { success: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(SimulatorPage);
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<SimulatorPage>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  // Le chargement enchaîne deux lectures : on laisse leurs promesses se vider.
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
}

const host = (fixture: ComponentFixture<SimulatorPage>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

function click(fixture: ComponentFixture<SimulatorPage>, selector: string): void {
  const button = host(fixture).querySelector<HTMLButtonElement>(selector);
  if (button === null) {
    throw new Error(`${selector} absent`);
  }
  button.click();
}

describe('SimulatorPage', () => {
  it('ouvre sur le scénario d’exemple, pré-rempli par la flotte active', async () => {
    const fixture = await boot();
    expect(host(fixture).querySelectorAll('[data-stop]')).toHaveLength(6);
    expect(host(fixture).querySelectorAll('[data-vehicle]')).toHaveLength(1);
    expect(host(fixture).querySelector('[data-fleet-unread]')).toBeNull();
  });

  it('propose le scénario d’exemple avec les réglages en vigueur, en tournées neuves', async () => {
    const fixture = await boot();
    click(fixture, '[data-propose]');
    await settle(fixture);

    expect(wire.sent).toHaveLength(1);
    expect(wire.sent[0]).toMatchObject({
      vehicles: ['Kangoo'],
      departure: null,
      settings: { detourPercent: 140, defaultMode: 'new_rounds' },
    });
    const result = host(fixture).querySelector('[data-simulation-result]')?.textContent ?? '';
    expect(result).toContain('Départ de Labo');
    expect(result).toContain('Arrêt La Daille · arrivée vers 7 h 20');
    expect(host(fixture).querySelector('[data-window-missed]')).not.toBeNull();
    expect(host(fixture).querySelector('[data-crow-flies]')?.textContent).toContain('vol d’oiseau');
    expect(host(fixture).querySelector('[data-overflow]')?.textContent).toContain(
      'Arrêt La Rosière.',
    );
  });

  it('sans droit sur les réglages, laisse les champs vides, le dit, et refuse de proposer', async () => {
    const fixture = await boot(['delivery_rounds:read']);
    expect(host(fixture).querySelector('[data-fleet-unread]')).not.toBeNull();
    expect(host(fixture).querySelector('[data-settings-unread]')).not.toBeNull();

    click(fixture, '[data-propose]');
    await settle(fixture);
    expect(wire.sent).toHaveLength(0);
    const errors = host(fixture).querySelector('[data-draft-errors]')?.textContent ?? '';
    expect(errors).toContain('Au moins un véhicule.');
    expect(errors).toContain('Réglages incomplets');
  });

  it('montre le refus du serveur tel quel', async () => {
    const fixture = await boot();
    wire.refuse = 'Le facteur de détour ne peut pas descendre sous ×1.';
    click(fixture, '[data-propose]');
    await settle(fixture);
    expect(host(fixture).querySelector('[data-simulation-refusal]')?.textContent).toContain(
      'Le facteur de détour ne peut pas descendre sous ×1.',
    );
    expect(host(fixture).querySelector('[data-simulation-result]')).toBeNull();
  });

  it('ajoute et retire un arrêt', async () => {
    const fixture = await boot();
    click(fixture, '[data-add-stop]');
    await settle(fixture);
    expect(host(fixture).querySelectorAll('[data-stop]')).toHaveLength(7);
    click(fixture, '[data-remove-stop] button');
    await settle(fixture);
    expect(host(fixture).querySelectorAll('[data-stop]')).toHaveLength(6);
  });
});
