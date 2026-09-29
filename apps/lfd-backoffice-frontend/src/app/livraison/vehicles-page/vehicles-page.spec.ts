import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { StaffPermission, VehicleView } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { DeliverySettingsService } from '../delivery-settings.service';
import { VehicleDialog } from '../vehicle-dialog/vehicle-dialog';
import { VehiclesPage } from './vehicles-page';

function vehicle(id: string, name: string, retiredAt: string | null = null): VehicleView {
  return {
    id,
    name,
    plate: `PL-${id}`,
    retiredAt,
    createdAt: '2026-01-01T08:00:00.000Z',
    cargo: null,
    refrigeration: null,
    energy: null,
  };
}

interface Wire {
  vehicles: VehicleView[] | null;
  reads: number;
  retired: string[];
  reactivated: string[];
  refuse: string | null;
  opened: { component: unknown; data: unknown }[];
  answer: (result: boolean | undefined) => void;
  said: string[];
}

let wire: Wire;

function writeOutcome(): Promise<void> {
  return wire.refuse === null
    ? Promise.resolve()
    : Promise.reject(new HttpErrorResponse({ status: 409, error: { message: wire.refuse } }));
}

async function boot(
  vehicles: VehicleView[] | null,
  grants: readonly StaffPermission[] = ['delivery_settings:read', 'delivery_settings:write'],
): Promise<ComponentFixture<VehiclesPage>> {
  wire = {
    vehicles,
    reads: 0,
    retired: [],
    reactivated: [],
    refuse: null,
    opened: [],
    answer: () => undefined,
    said: [],
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [VehiclesPage],
    providers: [
      {
        provide: DeliverySettingsService,
        useValue: {
          vehicles: () => {
            wire.reads += 1;
            return wire.vehicles === null
              ? Promise.reject(new Error('indisponible'))
              : Promise.resolve({ vehicles: wire.vehicles });
          },
          retireVehicle: (id: string) => {
            wire.retired.push(id);
            return writeOutcome();
          },
          reactivateVehicle: (id: string) => {
            wire.reactivated.push(id);
            return writeOutcome();
          },
        } satisfies Pick<
          DeliverySettingsService,
          'vehicles' | 'retireVehicle' | 'reactivateVehicle'
        >,
      },
      {
        provide: PermissionsStore,
        useValue: { can: (permission: StaffPermission) => grants.includes(permission) },
      },
      { provide: NotifyService, useValue: { success: (m: string) => wire.said.push(m) } },
      {
        provide: FoldPanelHostService,
        useValue: {
          open: (component: unknown, config: { data: unknown }) => {
            wire.opened.push({ component, data: config.data });
            return {
              closed: new Promise<boolean | undefined>((resolve) => {
                wire.answer = resolve;
              }),
            };
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(VehiclesPage);
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<VehiclesPage>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

const host = (fixture: ComponentFixture<VehiclesPage>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

const all = (fixture: ComponentFixture<VehiclesPage>, selector: string): HTMLElement[] => [
  ...host(fixture).querySelectorAll<HTMLElement>(selector),
];

function click(fixture: ComponentFixture<VehiclesPage>, selector: string, index = 0): void {
  const button = all(fixture, selector)[index];
  if (button === undefined) throw new Error(`${selector} absent.`);
  button.click();
}

const FLEET = [
  vehicle('1', 'Kangoo'),
  vehicle('2', 'Trafic', '2026-02-01T10:00:00.000Z'),
  vehicle('3', 'Jumpy'),
];

describe('VehiclesPage', () => {
  it('montre les actifs d’abord, et les retirés à part avec leur date', async () => {
    const fixture = await boot(FLEET);

    expect(all(fixture, '[data-active-vehicle]').map((card) => card.textContent)).toEqual([
      expect.stringContaining('Kangoo'),
      expect.stringContaining('Jumpy'),
    ]);
    const retired = all(fixture, '[data-retired-vehicle]');
    expect(retired).toHaveLength(1);
    expect(retired[0]?.textContent).toContain('retiré le 1 février 2026');
    expect(host(fixture).textContent).toContain('2 véhicules actifs');
  });

  it('dit le chargement : dimensions et volume, le froid, « Sec » sinon', async () => {
    const fixture = await boot([
      {
        ...vehicle('1', 'Frigo'),
        cargo: { lengthCm: 250, widthCm: 170, heightCm: 130, volumeLiters: 5525 },
        refrigeration: { volumeLiters: 400, minTempC: 0, maxTempC: 4 },
      },
      vehicle('3', 'Jumpy'),
    ]);
    expect(all(fixture, '[data-load]').map((line) => line.textContent.trim())).toEqual([
      '250 × 170 × 130 cm · 5,5 m³ · ❄ 400 L · 0 à +4 °C',
    ]);
  });

  it('dit l’énergie quand elle est renseignée, rien sinon', async () => {
    const fixture = await boot([
      { ...vehicle('1', 'Zoé'), energy: 'electric' },
      vehicle('3', 'Jumpy'),
    ]);
    expect(all(fixture, '[data-energy]').map((line) => line.textContent.trim())).toEqual([
      'Électrique',
    ]);
  });

  it('dit la flotte vide sans inventer de nombre', async () => {
    const fixture = await boot([]);
    expect(all(fixture, '[data-fleet-empty]')).toHaveLength(1);
  });

  it('dit l’échec de lecture, et relit sur demande', async () => {
    const fixture = await boot(null);
    expect(all(fixture, '[data-fleet-error]')).toHaveLength(1);

    wire.vehicles = FLEET;
    click(fixture, '[data-fleet-error] button');
    await settle(fixture);
    expect(all(fixture, '[data-active-vehicle]')).toHaveLength(2);
  });

  it('sans droit d’écriture, aucun geste n’est offert', async () => {
    const fixture = await boot(FLEET, ['delivery_settings:read']);
    expect(all(fixture, '[data-add], [data-correct], [data-retire], [data-reactivate]')).toEqual(
      [],
    );
  });

  it('retirer écrit, annonce et relit', async () => {
    const fixture = await boot(FLEET);
    click(fixture, '[data-retire]', 1);
    await settle(fixture);

    expect(wire.retired).toEqual(['3']);
    expect(wire.said).toEqual(['« Jumpy » retiré de la flotte.']);
    expect(wire.reads).toBe(2);
  });

  it('🔴 un refus de réactivation s’affiche tel quel, la liste reste', async () => {
    const fixture = await boot(FLEET);
    wire.refuse = 'La plaque PL-2 est déjà portée par le véhicule actif « Kangoo ».';
    click(fixture, '[data-reactivate]');
    await settle(fixture);

    expect(wire.reactivated).toEqual(['2']);
    expect(all(fixture, '[data-refusal]')[0]?.textContent).toContain(
      'déjà portée par le véhicule actif « Kangoo »',
    );
    expect(all(fixture, '[data-active-vehicle]')).toHaveLength(2);
  });

  it('corriger ouvre le dialogue sur le véhicule, et relit s’il enregistre', async () => {
    const fixture = await boot(FLEET);
    click(fixture, '[data-correct]');
    expect(wire.opened).toEqual([{ component: VehicleDialog, data: { vehicle: FLEET[0] } }]);

    wire.answer(true);
    await settle(fixture);
    expect(wire.said).toEqual(['Véhicule mis à jour.']);
    expect(wire.reads).toBe(2);
  });

  it('un dialogue d’ajout abandonné ne relit rien', async () => {
    const fixture = await boot(FLEET);
    click(fixture, '[data-add]');
    expect(wire.opened).toEqual([{ component: VehicleDialog, data: {} }]);

    wire.answer(false);
    await settle(fixture);
    expect(wire.reads).toBe(1);
  });
});
