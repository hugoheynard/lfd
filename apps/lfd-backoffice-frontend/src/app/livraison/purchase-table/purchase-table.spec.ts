import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  BinTypeView,
  PurchaseBinCandidateView,
  PurchaseScenariosView,
  PurchaseScenarioView,
  SavePurchaseScenarioPayload,
  StaffPermission,
  PurchaseTablePayload,
  PurchaseTableView,
  PurchaseVehicleCandidateView,
  VehicleView,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { DeliveryBinsService } from '../delivery-bins.service';
import { DeliverySettingsService } from '../delivery-settings.service';
import { PurchaseLibraryService } from '../purchase-library.service';
import { PurchaseScenariosService } from '../purchase-scenarios.service';
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
  outer: { lengthMm: 600, widthMm: 400, heightMm: 300 },
  inner: { lengthMm: 560, widthMm: 360, heightMm: 280 },
  innerVolumeLiters: 56,
  isotherm: false,
  maxStack: 5,
  supplier: null,
  unitPriceCentsExclVat: 1250,
};

const BIN_TYPE: BinTypeView = {
  id: 'bt1',
  name: 'Bac maison',
  outer: { lengthMm: 600, widthMm: 400, heightMm: 300 },
  inner: { lengthMm: 560, widthMm: 360, heightMm: 280 },
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
  grants: StaffPermission[];
  scenario: PurchaseScenarioView;
  created: SavePurchaseScenarioPayload[];
  replaced: { id: string; payload: SavePurchaseScenarioPayload }[];
}

/** Un scénario enregistré : la flotte et un format en service, plus un candidat archivé depuis. */
const SCENARIO: PurchaseScenarioView = {
  id: 'ps1',
  name: 'Kangoo et bacs',
  selection: {
    vehicles: [{ source: 'fleet', id: 'veh1' }],
    formats: [
      { source: 'bin_type', id: 'bt1' },
      { source: 'candidate', id: 'pb-old' },
    ],
    gapCm: 3,
  },
  display: { criterion: 'volume', showCostPerLiter: true },
  updatedAt: '2026-01-01T08:00:00.000Z',
  archivedAt: null,
  issues: [
    {
      kind: 'bin_candidate',
      source: 'candidate',
      id: 'pb-old',
      name: 'Caisse Dupont 50',
      problem: 'archived',
      message: 'Le format « Caisse Dupont 50 » a été archivé — retirez-le de la sélection.',
    },
  ],
};

const SCENARIOS: PurchaseScenariosView = {
  scenarios: [
    {
      id: 'ps1',
      name: 'Kangoo et bacs',
      vehicles: 1,
      formats: 2,
      updatedAt: '2026-01-01T08:00:00.000Z',
      updatedBy: 'Hugo',
      archivedAt: null,
    },
  ],
};

let wire: Wire;

async function boot(
  vehicles: PurchaseVehicleCandidateView[] = [candidateVehicle(1)],
  fleetDown = false,
  grants: StaffPermission[] = ['delivery_rounds:read', 'delivery_rounds:write'],
): Promise<ComponentFixture<PurchaseTable>> {
  wire = {
    asked: [],
    refuse: null,
    fleetDown,
    grants,
    scenario: SCENARIO,
    created: [],
    replaced: [],
  };
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
      {
        provide: PurchaseScenariosService,
        useValue: {
          list: () => Promise.resolve(SCENARIOS),
          open: () => Promise.resolve(wire.scenario),
          create: (payload: SavePurchaseScenarioPayload) => {
            wire.created.push(payload);
            return Promise.resolve('ps-new');
          },
          replace: (id: string, payload: SavePurchaseScenarioPayload) => {
            wire.replaced.push({ id, payload });
            return Promise.resolve();
          },
          archive: () => Promise.resolve(),
          reactivate: () => Promise.resolve(),
        } satisfies Pick<
          PurchaseScenariosService,
          'list' | 'open' | 'create' | 'replace' | 'archive' | 'reactivate'
        >,
      },
      {
        provide: PermissionsStore,
        useValue: { can: (permission: StaffPermission) => wire.grants.includes(permission) },
      },
      { provide: NotifyService, useValue: { success: () => undefined } },
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

  it('ouvrir un scénario remet la sélection, le jeu et le critère, et nomme l’archivé à part', async () => {
    const fixture = await boot();
    click(fixture, '[data-scenario-open]');
    await settle(fixture);

    const checked = [
      ...host(fixture).querySelectorAll<HTMLInputElement>(
        '[data-vehicle-choice] input, [data-format-choice] input',
      ),
    ].map((box) => box.checked);
    // Candidat 1, Kangoo | Caisse 50, Bac maison
    expect(checked).toEqual([false, true, false, true]);
    expect(host(fixture).querySelector('[data-scenario-issues]')?.textContent).toContain(
      'Caisse Dupont 50',
    );
    expect(host(fixture).querySelector('[data-current-scenario]')?.textContent).toContain(
      'Kangoo et bacs',
    );
    // Un élément à corriger : le tableau ne part pas tout seul.
    expect(wire.asked).toEqual([]);

    click(fixture, '[data-drop-issue]');
    expect(host(fixture).querySelector('[data-scenario-issues]')).toBeNull();
    computeButton(fixture).click();
    await settle(fixture);
    expect(wire.asked).toEqual([
      {
        vehicles: [{ source: 'fleet', id: 'veh1' }],
        formats: [{ source: 'bin_type', id: 'bt1' }],
        gapCm: 3,
      },
    ]);
  });

  it('un scénario sans élément à corriger relance le tableau dès l’ouverture', async () => {
    const fixture = await boot();
    wire.scenario = {
      ...SCENARIO,
      selection: { ...SCENARIO.selection, formats: [{ source: 'bin_type', id: 'bt1' }] },
      issues: [],
    };
    click(fixture, '[data-scenario-open]');
    await settle(fixture);

    expect(wire.asked).toHaveLength(1);
    expect(host(fixture).querySelector('[data-cell]')).not.toBeNull();
  });

  it('enregistre la sélection, le critère et le coût par litre sous un nom, puis remplace', async () => {
    const fixture = await boot();
    check(fixture, '[data-vehicle-choice]', 1);
    check(fixture, '[data-format-choice]', 1);
    click(fixture, '[data-save-as]');
    type(fixture, '[data-save-name] input', 'Mon essai');
    click(fixture, '[data-save-as-confirm]');
    await settle(fixture);

    expect(wire.created).toEqual([
      {
        name: 'Mon essai',
        selection: {
          vehicles: [{ source: 'fleet', id: 'veh1' }],
          formats: [{ source: 'bin_type', id: 'bt1' }],
          gapCm: 1,
        },
        display: { criterion: 'occupation', showCostPerLiter: false },
      },
    ]);
    click(fixture, '[data-replace]');
    await settle(fixture);
    expect(wire.replaced.map((r) => [r.id, r.payload.name])).toEqual([['ps-new', 'Mon essai']]);
  });

  it('sans droit d’écriture, ni enregistrer, ni remplacer, ni archiver', async () => {
    const fixture = await boot([candidateVehicle(1)], false, ['delivery_rounds:read']);
    expect(host(fixture).querySelector('[data-scenario-open]')).not.toBeNull();
    expect(host(fixture).querySelector('[data-save-as]')).toBeNull();
    expect(host(fixture).querySelector('[data-scenario-archive]')).toBeNull();
  });
});

function click(fixture: ComponentFixture<PurchaseTable>, selector: string): void {
  const target = host(fixture).querySelector<HTMLElement>(selector);
  if (target === null) throw new Error(`${selector} absent.`);
  target.click();
  fixture.detectChanges();
}

function type(fixture: ComponentFixture<PurchaseTable>, selector: string, value: string): void {
  const field = host(fixture).querySelector<HTMLInputElement>(selector);
  if (field === null) throw new Error(`${selector} absent.`);
  field.value = value;
  field.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}
