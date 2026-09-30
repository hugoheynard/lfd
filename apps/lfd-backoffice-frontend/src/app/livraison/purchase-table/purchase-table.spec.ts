import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  BinTypeView,
  PurchaseBinCandidateView,
  PurchaseTablePayload,
  PurchaseTableView,
  PurchaseVehicleCandidateView,
  VehicleView,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { DeliveryBinsService } from '../delivery-bins.service';
import { DeliverySettingsService } from '../delivery-settings.service';
import { PurchaseLibraryService } from '../purchase-library.service';
import { PurchaseTable } from './purchase-table';

const AUTHOR = { staffUserId: 's1', name: 'Hugo', role: 'admin' };

function candidateVehicle(index: number): PurchaseVehicleCandidateView {
  return {
    id: `pv${String(index)}`,
    name: `Candidat ${String(index)}`,
    reference: null,
    purchaseUrl: null,
    createdAt: '2026-01-01T08:00:00.000Z',
    updatedAt: '2026-01-01T08:00:00.000Z',
    updatedBy: AUTHOR,
    archivedAt: null,
    cargo: { lengthCm: 250, widthCm: 170, heightCm: 130, volumeLiters: 5525 },
    wheelArches: null,
    priceCentsExclVat: null,
  };
}

const FLEET: VehicleView[] = [
  {
    id: 'veh1',
    name: 'Kangoo',
    plate: 'AB-123-CD',
    retiredAt: null,
    createdAt: '2026-01-01T08:00:00.000Z',
    cargo: { lengthCm: 180, widthCm: 120, heightCm: 110, volumeLiters: 2376 },
    wheelArches: null,
    refrigeration: null,
    energy: null,
  },
  {
    // Sans espace utile : il ne se compare à rien, il n'est pas proposé.
    id: 'veh2',
    name: 'Sans cotes',
    plate: 'EF-456-GH',
    retiredAt: null,
    createdAt: '2026-01-01T08:00:00.000Z',
    cargo: null,
    wheelArches: null,
    refrigeration: null,
    energy: null,
  },
];

const BIN_CANDIDATE: PurchaseBinCandidateView = {
  id: 'pb1',
  name: 'Caisse 50',
  reference: null,
  purchaseUrl: null,
  createdAt: '2026-01-01T08:00:00.000Z',
  updatedAt: '2026-01-01T08:00:00.000Z',
  updatedBy: AUTHOR,
  archivedAt: null,
  outer: { lengthCm: 60, widthCm: 40, heightCm: 30 },
  inner: { lengthCm: 56, widthCm: 36, heightCm: 28 },
  innerVolumeLiters: 56,
  isotherm: false,
  maxStack: 5,
  supplier: null,
  unitPriceCentsExclVat: 1250,
};

const BIN_TYPE: BinTypeView = {
  id: 'bt1',
  name: 'Bac maison',
  outer: { lengthCm: 60, widthCm: 40, heightCm: 30 },
  inner: { lengthCm: 56, widthCm: 36, heightCm: 28 },
  innerVolumeLiters: 56,
  isotherm: false,
  maxStack: 5,
  divisible: false,
  archivedAt: null,
};

const VIEW: PurchaseTableView = {
  gapCm: 1,
  formats: [
    {
      source: 'bin_type',
      id: 'bt1',
      name: 'Bac maison',
      innerVolumeLiters: 56,
      unitPriceCentsExclVat: null,
    },
  ],
  rows: [
    {
      source: 'fleet',
      id: 'veh1',
      name: 'Kangoo',
      vehicleVolumeLiters: 2376,
      priceCentsExclVat: null,
      cells: [
        {
          total: 12,
          floorCount: 6,
          levels: 2,
          usefulLiters: 672,
          vehiclePercent: 28,
          heightLimit: 'stack',
          equipmentCostCents: null,
          totalCostCents: null,
          costPerLiterCents: null,
        },
      ],
      best: { occupation: 0, volume: 0, costPerLiter: null },
    },
  ],
  bestRowByCostPerLiter: null,
};

interface Wire {
  asked: PurchaseTablePayload[];
  refuse: string | null;
  fleetDown: boolean;
}

let wire: Wire;

async function boot(
  vehicles: PurchaseVehicleCandidateView[] = [candidateVehicle(1)],
  fleetDown = false,
): Promise<ComponentFixture<PurchaseTable>> {
  wire = { asked: [], refuse: null, fleetDown };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [PurchaseTable],
    providers: [
      {
        provide: PurchaseLibraryService,
        useValue: {
          vehicleCandidates: () => Promise.resolve({ candidates: vehicles }),
          binCandidates: () => Promise.resolve({ candidates: [BIN_CANDIDATE] }),
          table: (payload: PurchaseTablePayload) => {
            wire.asked.push(payload);
            return wire.refuse === null
              ? Promise.resolve(VIEW)
              : Promise.reject(
                  new HttpErrorResponse({ status: 409, error: { message: wire.refuse } }),
                );
          },
        } satisfies Pick<PurchaseLibraryService, 'vehicleCandidates' | 'binCandidates' | 'table'>,
      },
      {
        provide: DeliverySettingsService,
        useValue: {
          vehicles: () =>
            wire.fleetDown
              ? Promise.reject(new Error('indisponible'))
              : Promise.resolve({ vehicles: FLEET }),
        } satisfies Pick<DeliverySettingsService, 'vehicles'>,
      },
      {
        provide: DeliveryBinsService,
        useValue: {
          binTypes: () => Promise.resolve({ types: [BIN_TYPE] }),
        } satisfies Pick<DeliveryBinsService, 'binTypes'>,
      },
    ],
  });
  const fixture = TestBed.createComponent(PurchaseTable);
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<PurchaseTable>): Promise<void> {
  fixture.detectChanges();
  // Quatre lectures en `allSettled` : `whenStable` ne suit pas des promesses nues.
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

const host = (fixture: ComponentFixture<PurchaseTable>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

function check(fixture: ComponentFixture<PurchaseTable>, selector: string, index: number): void {
  const box = host(fixture).querySelectorAll<HTMLInputElement>(`${selector} input`)[index];
  if (box === undefined) throw new Error(`${selector} #${String(index)} absent.`);
  box.click();
  fixture.detectChanges();
}

const computeButton = (fixture: ComponentFixture<PurchaseTable>): HTMLButtonElement => {
  const button = host(fixture).querySelector<HTMLButtonElement>('[data-compute]');
  if (button === null) throw new Error('Bouton absent.');
  return button;
};

describe('PurchaseTable', () => {
  it('propose les candidats, puis la flotte mesurée ; les formats candidats, puis en service', async () => {
    const fixture = await boot();
    const vehicles = [...host(fixture).querySelectorAll('[data-vehicle-choice]')].map(
      (el) => el.textContent,
    );
    expect(vehicles).toEqual([
      expect.stringContaining('Candidat 1'),
      expect.stringContaining('Kangoo'),
    ]);
    const formats = [...host(fixture).querySelectorAll('[data-format-choice]')].map(
      (el) => el.textContent,
    );
    expect(formats).toEqual([
      expect.stringContaining('Caisse 50'),
      expect.stringContaining('Bac maison'),
    ]);
  });

  it('envoie les références cochées dans l’ordre de la liste, et dessine la grille', async () => {
    const fixture = await boot();
    expect(computeButton(fixture).disabled).toBe(true);
    check(fixture, '[data-vehicle-choice]', 1);
    check(fixture, '[data-format-choice]', 1);
    check(fixture, '[data-format-choice]', 0);
    computeButton(fixture).click();
    await settle(fixture);

    expect(wire.asked).toEqual([
      {
        vehicles: [{ source: 'fleet', id: 'veh1' }],
        formats: [
          { source: 'candidate', id: 'pb1' },
          { source: 'bin_type', id: 'bt1' },
        ],
        gapCm: 1,
      },
    ]);
    expect(host(fixture).querySelector('[data-cell]')?.textContent).toContain('12 bacs');
  });

  it('dix véhicules au plus : le onzième ne se coche pas', async () => {
    const eleven = Array.from({ length: 11 }, (_, i) => candidateVehicle(i));
    const fixture = await boot(eleven);
    for (let i = 0; i < 10; i += 1) check(fixture, '[data-vehicle-choice]', i);
    expect(host(fixture).textContent).toContain('10 sur 10 au plus');
    const eleventh = host(fixture).querySelectorAll<HTMLInputElement>(
      '[data-vehicle-choice] input',
    )[10];
    expect(eleventh?.disabled).toBe(true);
  });

  it('le coût par litre est masqué par défaut, et s’affiche sur demande', async () => {
    const fixture = await boot();
    check(fixture, '[data-vehicle-choice]', 1);
    check(fixture, '[data-format-choice]', 1);
    computeButton(fixture).click();
    await settle(fixture);
    expect(host(fixture).querySelector('[data-cost-per-liter]')).toBeNull();

    check(fixture, '[data-show-cost-per-liter]', 0);
    expect(host(fixture).querySelector('[data-cost-per-liter]')?.textContent).toContain('inconnu');
  });

  it('🔴 un refus du serveur s’affiche tel quel', async () => {
    const fixture = await boot();
    wire.refuse = 'Le format « Caisse 50 » a été archivé — retirez-le de la sélection.';
    check(fixture, '[data-vehicle-choice]', 0);
    check(fixture, '[data-format-choice]', 0);
    computeButton(fixture).click();
    await settle(fixture);
    expect(host(fixture).querySelector('[data-refusal]')?.textContent).toContain('a été archivé');
    expect(host(fixture).querySelector('[data-cell]')).toBeNull();
  });

  it('une source illisible se dit, le reste se compare', async () => {
    const fixture = await boot([candidateVehicle(1)], true);
    expect(host(fixture).querySelector('[data-unread]')?.textContent).toContain('la flotte');
    expect(host(fixture).querySelectorAll('[data-vehicle-choice]')).toHaveLength(1);
  });
});
