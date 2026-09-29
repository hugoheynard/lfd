import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type {
  BinCapacitiesView,
  BinTypeView,
  SetBinCapacityPayload,
  StaffPermission,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { DeliveryBinsService } from '../delivery-bins.service';
import { BinCapacitiesPage } from './bin-capacities-page';

function bin(id: string, name: string, isotherm = false): BinTypeView {
  return {
    id,
    name,
    outer: { lengthCm: 60, widthCm: 40, heightCm: 30 },
    inner: { lengthCm: 56, widthCm: 36, heightCm: 27 },
    innerVolumeLiters: 54,
    isotherm,
    maxStack: 5,
    divisible: true,
    archivedAt: null,
  };
}

const GRID: BinCapacitiesView = {
  products: [
    { sku: 'CRO-01', name: 'Croissant', requiresCold: false },
    { sku: 'PAI-03', name: 'Pain de campagne', requiresCold: false },
  ],
  types: [bin('M', 'Bac M'), bin('S', 'Bac S')],
  capacities: [{ binTypeId: 'M', sku: 'CRO-01', units: 40 }],
};

interface Wire {
  view: BinCapacitiesView | null;
  writes: SetBinCapacityPayload[];
  refuse: string | null;
  said: string[];
}

let wire: Wire;

async function boot(
  view: BinCapacitiesView | null,
  grants: readonly StaffPermission[] = ['delivery_settings:read', 'delivery_settings:write'],
): Promise<ComponentFixture<BinCapacitiesPage>> {
  wire = { view, writes: [], refuse: null, said: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [BinCapacitiesPage],
    providers: [
      provideRouter([]),
      {
        provide: DeliveryBinsService,
        useValue: {
          capacities: () =>
            wire.view === null
              ? Promise.reject(new Error('indisponible'))
              : Promise.resolve(wire.view),
          setCapacity: (payload: SetBinCapacityPayload) => {
            wire.writes.push(payload);
            return wire.refuse === null
              ? Promise.resolve()
              : Promise.reject(
                  new HttpErrorResponse({ status: 400, error: { message: wire.refuse } }),
                );
          },
        } satisfies Pick<DeliveryBinsService, 'capacities' | 'setCapacity'>,
      },
      {
        provide: PermissionsStore,
        useValue: { can: (permission: StaffPermission) => grants.includes(permission) },
      },
      { provide: NotifyService, useValue: { success: (m: string) => wire.said.push(m) } },
    ],
  });
  const fixture = TestBed.createComponent(BinCapacitiesPage);
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<BinCapacitiesPage>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

const host = (fixture: ComponentFixture<BinCapacitiesPage>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

const all = (fixture: ComponentFixture<BinCapacitiesPage>, selector: string): HTMLElement[] => [
  ...host(fixture).querySelectorAll<HTMLElement>(selector),
];

/** Ouvre le tiroir de saisie de la n-ième ligne. */
async function open(fixture: ComponentFixture<BinCapacitiesPage>, row: number): Promise<void> {
  const toggle = all(fixture, 'button[aria-label="Saisir les contenances"]')[row];
  if (toggle === undefined) throw new Error(`Tiroir ${String(row)} absent.`);
  toggle.click();
  await settle(fixture);
}

/** Les champs du tiroir ouvert, un par type (0 = Bac M, 1 = Bac S). */
function cellInput(fixture: ComponentFixture<BinCapacitiesPage>, index: number): HTMLInputElement {
  const input = all(fixture, '[data-cell] input')[index];
  if (!(input instanceof HTMLInputElement)) throw new Error(`Case ${String(index)} absente.`);
  return input;
}

async function typeAndLeave(
  fixture: ComponentFixture<BinCapacitiesPage>,
  index: number,
  value: string,
): Promise<void> {
  const input = cellInput(fixture, index);
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  await settle(fixture);
}

describe('BinCapacitiesPage', () => {
  it('montre une ligne par produit, une case par type, et signale le produit sans contenance', async () => {
    const fixture = await boot(GRID);

    expect(host(fixture).querySelector('fold-data-table')?.textContent).toMatch(
      /Croissant.*40.*—/s,
    );
    await open(fixture, 0);
    expect(all(fixture, '[data-cell]')).toHaveLength(2);
    expect(cellInput(fixture, 0).value).toBe('40');
    expect(cellInput(fixture, 1).value).toBe('');
    expect(all(fixture, '[data-missing]')[0]?.textContent).toContain(
      '1 produit sans aucune contenance',
    );
    expect(all(fixture, '[data-half-bin]')[0]?.textContent).toContain(
      'Un demi-bac contient la moitié de la place.',
    );
  });

  it('enregistre la case quittée, seule, et la reporte sans relire', async () => {
    const fixture = await boot(GRID);
    await open(fixture, 1);
    await typeAndLeave(fixture, 1, '24');

    expect(wire.writes).toEqual([{ binTypeId: 'S', sku: 'PAI-03', units: 24 }]);
    expect(all(fixture, '[data-missing]')).toEqual([]);
  });

  it('une case vidée retire la contenance', async () => {
    const fixture = await boot(GRID);
    await open(fixture, 0);
    await typeAndLeave(fixture, 0, '');

    expect(wire.writes).toEqual([{ binTypeId: 'M', sku: 'CRO-01', units: null }]);
    expect(all(fixture, '[data-missing]')[0]?.textContent).toContain('2 produits');
  });

  it('🔴 refuse une fraction sans rien envoyer, en nommant la case', async () => {
    const fixture = await boot(GRID);
    await open(fixture, 0);
    await typeAndLeave(fixture, 1, '2.5');

    expect(wire.writes).toEqual([]);
    expect(all(fixture, '[data-refusal]')[0]?.textContent).toContain(
      '« Croissant » dans « Bac S » : Une contenance est un nombre entier d’unités.',
    );
  });

  it('quitter une case inchangée n’écrit rien', async () => {
    const fixture = await boot(GRID);
    await open(fixture, 0);
    await typeAndLeave(fixture, 0, '40');
    expect(wire.writes).toEqual([]);
  });

  it('un refus du serveur s’affiche, la grille reste', async () => {
    const fixture = await boot(GRID);
    wire.refuse = 'Ce type de bac est archivé.';
    await open(fixture, 0);
    await typeAndLeave(fixture, 1, '12');

    expect(all(fixture, '[data-refusal]')[0]?.textContent).toContain('Ce type de bac est archivé.');
    expect(cellInput(fixture, 1).value).toBe('12');
  });

  it('🔴 marque le froid, et signale le froid qui n’a de contenance que dans un bac sec', async () => {
    const fixture = await boot({
      ...GRID,
      products: [
        { sku: 'CRO-01', name: 'Croissant', requiresCold: true },
        { sku: 'PAI-03', name: 'Pain de campagne', requiresCold: false },
        { sku: 'GLA-04', name: 'Glace', requiresCold: true },
      ],
      types: [bin('M', 'Bac M'), bin('F', 'Bac froid', true)],
      capacities: [
        { binTypeId: 'M', sku: 'CRO-01', units: 40 },
        { binTypeId: 'M', sku: 'PAI-03', units: 6 },
        { binTypeId: 'F', sku: 'GLA-04', units: 12 },
      ],
    });

    expect(all(fixture, '[data-cold-gap]')[0]?.textContent).toContain(
      '1 produit froid sans bac isotherme',
    );
    expect(all(fixture, '[data-cold-gap-badge]')).toHaveLength(1);
    expect(all(fixture, '[data-cold-badge]')).toHaveLength(1);
    expect(all(fixture, '[data-missing]')).toEqual([]);

    const toggle = host(fixture).querySelector('[data-only-gaps] input');
    if (!(toggle instanceof HTMLInputElement)) throw new Error('Filtre absent.');
    toggle.click();
    await settle(fixture);
    const table = host(fixture).querySelector('fold-data-table')?.textContent ?? '';
    expect(table).toContain('Croissant');
    expect(table).not.toContain('Glace');
  });

  it('le filtre des manques garde les produits sans aucune contenance', async () => {
    const fixture = await boot(GRID);
    const toggle = host(fixture).querySelector('[data-only-gaps] input');
    if (!(toggle instanceof HTMLInputElement)) throw new Error('Filtre absent.');
    toggle.click();
    await settle(fixture);

    expect(host(fixture).textContent).toContain('Pain de campagne');
    expect(host(fixture).textContent).not.toContain('Croissant');
  });

  it('sans droit d’écriture, la grille se lit et rien ne s’y saisit', async () => {
    const fixture = await boot(GRID, ['delivery_settings:read']);
    expect(all(fixture, 'button[aria-label="Saisir les contenances"]')).toEqual([]);
    expect(host(fixture).querySelector('fold-data-table')?.textContent).toMatch(
      /Croissant.*40.*—/s,
    );
  });

  it('sans type de bac, renvoie vers les bacs ; en échec, propose de relire', async () => {
    expect(all(await boot({ ...GRID, types: [] }), '[data-no-types]')).toHaveLength(1);
    expect(all(await boot(null), '[data-grid-error]')).toHaveLength(1);
  });
});
