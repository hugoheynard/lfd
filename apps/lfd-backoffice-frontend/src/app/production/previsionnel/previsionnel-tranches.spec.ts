import type {
  CatalogFamilyView,
  CatalogItemView,
  ProductionDueThresholdsView,
  ProductionForecastView,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { dayTrancheGrid, type TrancheGrid } from './day-tranche-matrix';
import { forecastRayons } from './previsionnel-matrix';
import { trancheColumns, trancheFootRows, trancheRayons } from './previsionnel-tranches';

/** Les fabriques de la journée par tranche : colonnes, pied, rayons. */

const GRID: TrancheGrid = {
  columns: [
    {
      key: '05:00',
      kind: 'deadline',
      before: '05:00',
      label: 'avant 05:00',
      subtitle: null,
      state: 'over',
      stateLabel: 'Dépassée · 11 min',
    },
    {
      key: 'rest',
      kind: 'rest',
      before: null,
      label: 'Sans heure',
      subtitle: 'réassorts compris',
      state: null,
      stateLabel: null,
    },
  ],
  rows: [
    {
      sku: 'CRO',
      productName: 'Croissant',
      saleUnit: 'piece',
      total: 128,
      mismatch: null,
      cells: [
        {
          quantity: 120,
          label: '120',
          resupply: 0,
          progress: '80 / 120',
          state: 'over',
          stateLabel: 'Dépassée',
          beforeFirst: '20 attendus à 04:30, avant la première tranche',
        },
        {
          quantity: 8,
          label: '8',
          resupply: 8,
          progress: null,
          state: null,
          stateLabel: null,
          beforeFirst: null,
        },
      ],
    },
    {
      sku: 'PAIN',
      productName: 'Pain au poids',
      saleUnit: 'weight',
      total: 2500,
      mismatch: 'Échéances au-delà du prévisionnel : 3 kg pour 2,5 kg',
      cells: [
        null,
        {
          quantity: 2500,
          label: '2,5 kg',
          resupply: 0,
          progress: null,
          state: null,
          stateLabel: null,
          beforeFirst: null,
        },
      ],
    },
  ],
  loads: [
    { pieces: 120, grams: 0, resupply: 0 },
    { pieces: 8, grams: 2500, resupply: 8 },
  ],
  total: { pieces: 128, grams: 2500, resupply: 8 },
};

function item(sku: string, family: CatalogFamilyView): CatalogItemView {
  return { sku, name: sku, unitPriceMillicents: 0, vatRate: 5.5, family, category: null };
}

describe('les colonnes-tranches', () => {
  it('titre chaque colonne par son heure, et porte sa charge sans additionner pièces et poids', () => {
    const columns = trancheColumns(GRID, true, true);

    expect(columns.map((column) => column.title)).toEqual(['avant 05:00', 'Sans heure']);
    expect(columns.map((column) => column.subtitle)).toEqual([null, 'réassorts compris']);
    expect(columns.map((column) => column.figure)).toEqual(['120', '8 · 2,5 kg']);
    expect(columns.map((column) => column.foot)).toEqual([
      ['120', '', ''],
      ['8', '2,5 kg', '8'],
    ]);
    expect(columns.every((column) => column.overline === null && !column.peak)).toBe(true);
  });

  it('le jour même, nomme l’état et le dessine par la surcouche de colonne', () => {
    const [first, second] = trancheColumns(GRID, true, true);

    expect(first).toMatchObject({ mention: 'Dépassée · 11 min', tone: 'overdue' });
    expect(second).toMatchObject({ mention: null, tone: null });
  });

  it('sans état (jour à venir ou passé), ni mot ni surcouche', () => {
    expect(
      trancheColumns(GRID, false, true).map((column) => [column.mention, column.tone]),
    ).toEqual([
      [null, null],
      [null, null],
    ]);
  });

  it('un plan encore ouvert est une prévision ; inconnu, il ne s’atténue pas', () => {
    expect(trancheColumns(GRID, false, false).every((column) => !column.settled)).toBe(true);
    expect(trancheColumns(GRID, false, null).every((column) => column.settled)).toBe(true);
  });

  it('ne pose « Au poids » et « dont réassorts » que s’il y en a', () => {
    expect(trancheFootRows(GRID).map((row) => row.key)).toEqual(['pieces', 'weight', 'resupplies']);
    expect(
      trancheFootRows({ ...GRID, total: { pieces: 120, grams: 0, resupply: 0 } }).map(
        (row) => row.key,
      ),
    ).toEqual(['pieces']);
  });
});

describe('les rayons de la journée par tranche', () => {
  const catalogue = [
    item('CRO', { id: 'f1', name: 'Viennoiserie', position: 1 }),
    item('PAIN', { id: 'f2', name: 'Pain', position: 2 }),
  ];

  it('range comme la matrice, et un produit au poids pèse une pièce par case', () => {
    const rayons = trancheRayons(GRID, catalogue, true, false, true);

    expect(rayons.map((rayon) => rayon.label)).toEqual(['Viennoiserie', 'Pain']);
    expect(rayons[1]?.quantities).toEqual([0, 1]);
  });

  it('dit « sorti / à sortir » quand on le demande, et seulement alors', () => {
    const shown = trancheRayons(GRID, [], true, false, true)[0]?.lines;
    const hidden = trancheRayons(GRID, [], true, false, false)[0]?.lines;
    const cro = (lines: typeof shown) => lines?.find((line) => line.sku === 'CRO')?.cells[0];

    expect(cro(shown)?.progress).toEqual({
      label: '80 / 120',
      state: 'over',
      stateLabel: 'Dépassée',
    });
    expect(cro(shown)?.notes).toEqual(['20 attendus à 04:30, avant la première tranche']);
    expect(cro(hidden)?.progress).toBeUndefined();
    expect(cro(hidden)?.label).toBe('120');
  });

  it('porte l’alerte d’une ligne désynchronisée, et la part des réassorts dans la case', () => {
    const lines = trancheRayons(GRID, [], true, false, false)[0]?.lines;

    expect(lines?.find((line) => line.sku === 'PAIN')?.warning).toContain('au-delà');
    expect(lines?.find((line) => line.sku === 'CRO')?.cells[1]?.resupply).toBe(8);
  });

  /**
   * Régression (Hugo, 2026-11-01, « il me manque des catégories ») : les rayons
   * et leurs totaux sont ceux de la colonne du jour dans la matrice.
   */
  it('toutes les catégories du prévisionnel sont dans la journée par tranche, aux mêmes totaux', () => {
    const forecast: ProductionForecastView = {
      days: [
        {
          date: '2026-11-01',
          totalUnits: 0,
          orderCount: 0,
          resupplyUnits: 4,
          closed: false,
          state: 'open',
          closesAt: null,
        },
      ],
      peakDate: null,
      totalUnits: 0,
      lines: [
        {
          sku: 'CRO',
          productName: 'Croissant',
          saleUnit: 'piece',
          quantities: [40],
          resupplyQuantities: [0],
          totalUnits: 40,
        },
        {
          sku: 'TAR',
          productName: 'Tarte',
          saleUnit: 'piece',
          quantities: [6],
          resupplyQuantities: [0],
          totalUnits: 6,
        },
        {
          sku: 'CHO',
          productName: 'Tablette',
          saleUnit: 'piece',
          quantities: [4],
          resupplyQuantities: [4],
          totalUnits: 4,
        },
      ],
    };
    const due: ProductionDueThresholdsView = {
      date: '2026-11-01',
      deliveryMarginMinutes: 60,
      pickupMarginMinutes: 30,
      trancheMode: 'computed',
      fixedTranches: [],
      lines: [
        {
          sku: 'CRO',
          productName: 'Croissant',
          total: 30,
          thresholds: [{ kind: 'deadline', before: '07:00', quantity: 30, cumulative: 30 }],
        },
      ],
    };
    const shelves = [
      item('CRO', { id: 'v', name: 'Viennoiseries', position: 1 }),
      item('TAR', { id: 'p', name: 'Pâtisseries', position: 2 }),
      item('CHO', { id: 'c', name: 'Chocolat & confiserie', position: 3 }),
    ];
    const matrix = forecastRayons(forecast, shelves);
    const tranches = trancheRayons(
      dayTrancheGrid(forecast, '2026-11-01', due, null, null),
      shelves,
      true,
      false,
      false,
    );

    expect(tranches.map((rayon) => rayon.label)).toEqual(matrix.map((rayon) => rayon.label));
    expect(tranches.map((rayon) => rayon.totalUnits)).toEqual(
      matrix.map((rayon) => rayon.totalUnits),
    );
    for (const rayon of tranches) {
      for (const line of rayon.lines) {
        const sum = line.cells.reduce((total, cell) => total + cell.quantity, 0);
        expect(sum).toBe(
          forecast.lines.find((candidate) => candidate.sku === line.sku)?.quantities[0],
        );
      }
    }
  });
});
