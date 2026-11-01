import type {
  ProductionDueThresholdsView,
  ProductionForecastView,
  ProductionWorksheetView,
  WorkshopLine,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  dayTrancheGrid,
  decumulated,
  slotStateLabel,
  trancheColumnKeys,
} from './day-tranche-matrix';

/** La grille d'une journée par tranche : décumul, colonnes, totaux, états. */

function view(lines: ProductionDueThresholdsView['lines']): ProductionDueThresholdsView {
  return {
    date: '2026-11-01',
    deliveryMarginMinutes: 60,
    pickupMarginMinutes: 30,
    trancheMode: 'fixed',
    fixedTranches: ['05:00', '09:00'],
    lines,
  };
}

const DUE = view([
  {
    sku: 'CRO',
    productName: 'Croissant',
    total: 300,
    thresholds: [
      { kind: 'before_first', before: '05:00', quantity: 20, cumulative: 20, earliest: '04:30' },
      { kind: 'deadline', before: '09:00', quantity: 100, cumulative: 120 },
      { kind: 'undated', before: null, quantity: 180, cumulative: 300 },
    ],
  },
  {
    sku: 'PAIN',
    productName: 'Pain au poids',
    total: 2500,
    thresholds: [{ kind: 'deadline', before: '09:00', quantity: 2500, cumulative: 2500 }],
  },
  {
    sku: 'BAG',
    productName: 'Baguette',
    total: 50,
    thresholds: [{ kind: 'deadline', before: '05:00', quantity: 50, cumulative: 50 }],
  },
]);

function line(sku: string, over: Partial<WorkshopLine>): WorkshopLine {
  return {
    sku,
    productName: sku,
    quantity: 0,
    saleUnit: 'piece',
    containerLabel: null,
    done: false,
    initials: null,
    doneAt: null,
    produced: 0,
    remaining: 0,
    surplus: 0,
    batches: [],
    container: null,
    ...over,
  };
}

function sheet(groups: { label: string; lines: WorkshopLine[] }[]): ProductionWorksheetView {
  return {
    date: '2026-11-01',
    generatedAt: null,
    retakenAt: null,
    lines: groups.flatMap((group) => group.lines),
    drift: null,
    shelvesKnown: true,
    relativeDay: null,
    groups: groups.map((group) => ({
      key: group.label,
      family: null,
      category: null,
      label: group.label,
      lineCount: group.lines.length,
      doneCount: 0,
      totalUnits: 0,
      remainingUnits: 0,
      doneUnits: 0,
      lines: group.lines,
      pending: group.lines,
      done: [],
    })),
  };
}

const SHEET = sheet([
  {
    label: 'Viennoiserie',
    lines: [
      line('CRO', {
        quantity: 300,
        produced: 60,
        deadlines: [
          { quantity: 20, before: '05:00' },
          { quantity: 100, before: '09:00' },
          { quantity: 180, before: null },
        ],
      }),
    ],
  },
  {
    label: 'Boulangerie',
    lines: [
      line('PAIN', {
        quantity: 2500,
        saleUnit: 'weight',
        deadlines: [{ quantity: 2500, before: '09:00' }],
      }),
      line('BAG', { quantity: 50, produced: 50, deadlines: [{ quantity: 50, before: '05:00' }] }),
    ],
  },
]);

describe('decumulated', () => {
  it('rend ce que chaque tranche ajoute, pas le cumul', () => {
    const cells = decumulated(DUE).get('CRO');
    expect(cells?.get('05:00')).toBe(20);
    expect(cells?.get('09:00')).toBe(100);
    expect(cells?.get('undated')).toBe(180);
  });
});

describe('trancheColumnKeys', () => {
  it('trie les heures, « Sans heure » en dernier', () => {
    expect(trancheColumnKeys(decumulated(DUE))).toEqual(['05:00', '09:00', 'undated']);
  });
});

/**
 * Le prévisionnel de la journée : CRO, PAIN et BAG ont des échéances, TAR
 * (une pâtisserie) n'en a aucune, et CRO porte 12 réassorts au-delà de ses
 * commandes. Le jour d'après, ignoré, prouve qu'on lit la bonne colonne.
 */
const FORECAST: ProductionForecastView = {
  days: [
    {
      date: '2026-11-01',
      totalUnits: 0,
      orderCount: 0,
      resupplyUnits: 12,
      closed: false,
      state: 'open',
      closesAt: null,
    },
    {
      date: '2026-11-02',
      totalUnits: 0,
      orderCount: 0,
      resupplyUnits: 0,
      closed: false,
      state: 'open',
      closesAt: null,
    },
  ],
  peakDate: null,
  totalUnits: 0,
  lines: [
    forecastLine('CRO', 'Croissant', [312, 999], [12, 0]),
    forecastLine('PAIN', 'Pain au poids', [2500, 0], [0, 0], 'weight'),
    forecastLine('BAG', 'Baguette', [50, 0], [0, 0]),
    forecastLine('TAR', 'Tarte', [8, 0], [0, 0]),
  ],
};

function forecastLine(
  sku: string,
  productName: string,
  quantities: number[],
  resupplyQuantities: number[],
  saleUnit: 'piece' | 'weight' = 'piece',
): ProductionForecastView['lines'][number] {
  return {
    sku,
    productName,
    saleUnit,
    quantities,
    resupplyQuantities,
    totalUnits: quantities.reduce((sum, quantity) => sum + quantity, 0),
  };
}

const DATE = '2026-11-01';

describe('dayTrancheGrid', () => {
  /**
   * Régression (Hugo, 2026-11-01, « il me manque des catégories ») : la grille
   * partait des échéances, et un produit sans heure — pâtisserie, traiteur,
   * réassort — disparaissait de la journée par tranche.
   */
  it('toutes les catégories du prévisionnel sont dans la journée par tranche', () => {
    const grid = dayTrancheGrid(FORECAST, DATE, DUE, SHEET, null);
    expect(grid.rows.map((row) => row.sku)).toEqual(['CRO', 'PAIN', 'BAG', 'TAR']);
    const tar = grid.rows.find((row) => row.sku === 'TAR');
    expect(tar?.cells.at(-1)).toMatchObject({ quantity: 8 });
  });

  it('pour chaque produit, la somme des colonnes est le total de la matrice ce jour-là', () => {
    const grid = dayTrancheGrid(FORECAST, DATE, DUE, SHEET, null);
    for (const row of grid.rows) {
      const sum = row.cells.reduce((total, cell) => total + (cell?.quantity ?? 0), 0);
      const line = FORECAST.lines.find((candidate) => candidate.sku === row.sku);
      expect(sum).toBe(line?.quantities[0]);
    }
  });

  it('répartit par les échéances, et met le reste — réassorts compris — dans « Sans heure »', () => {
    const grid = dayTrancheGrid(FORECAST, DATE, DUE, SHEET, null);
    expect(grid.columns.map((column) => column.label)).toEqual([
      'avant 05:00',
      'avant 09:00',
      'Sans heure',
    ]);
    expect(grid.columns.at(-1)?.subtitle).toBe('réassorts compris');
    const cro = grid.rows.find((row) => row.sku === 'CRO');
    // 20 + 100 à heure ; 180 sans échéance + 12 réassorts.
    expect(cro?.cells.map((cell) => cell?.quantity)).toEqual([20, 100, 192]);
    expect(cro?.cells.at(-1)?.resupply).toBe(12);
  });

  it('jour à venir : des quantités, aucun sorti ni état', () => {
    const grid = dayTrancheGrid(FORECAST, DATE, DUE, SHEET, null);
    expect(
      grid.rows.every((row) => row.cells.every((cell) => cell === null || cell.progress === null)),
    ).toBe(true);
    expect(grid.columns.map((column) => column.state)).toEqual([null, null, null]);
  });

  it('ne mélange jamais pièces et poids dans un total', () => {
    const grid = dayTrancheGrid(FORECAST, DATE, DUE, SHEET, null);
    expect(grid.loads).toEqual([
      { pieces: 70, grams: 0, resupply: 0 },
      { pieces: 100, grams: 2500, resupply: 0 },
      { pieces: 200, grams: 0, resupply: 12 },
    ]);
    expect(grid.total).toEqual({ pieces: 370, grams: 2500, resupply: 12 });
  });

  it('le jour même : sorti / à sortir et les états de la vue par tranche', () => {
    const grid = dayTrancheGrid(FORECAST, DATE, DUE, SHEET, 6 * 60);
    const cro = grid.rows[0];
    expect(cro?.cells[0]).toMatchObject({ progress: '20 / 20', state: 'met' });
    expect(cro?.cells[1]).toMatchObject({ progress: '40 / 100', state: 'next' });
    expect(cro?.cells[2]).toMatchObject({ progress: null, state: null });
    expect(grid.columns[0]).toMatchObject({ state: 'met', stateLabel: 'Tenue' });
    expect(grid.columns[1]).toMatchObject({ state: 'next', stateLabel: 'La prochaine' });
    expect(grid.columns[2]).toMatchObject({ state: null });
  });

  it('signale le besoin d’avant la première tranche', () => {
    const cro = dayTrancheGrid(FORECAST, DATE, DUE, SHEET, null).rows[0];
    expect(cro?.cells[0]?.beforeFirst).toBe('20 attendus à 04:30, avant la première tranche');
    expect(cro?.cells[1]?.beforeFirst).toBeNull();
  });

  it('des échéances au-delà du prévisionnel : rien n’est réparti, et la ligne le dit', () => {
    const short: ProductionForecastView = {
      ...FORECAST,
      lines: [forecastLine('BAG', 'Baguette', [30, 0], [0, 0])],
    };
    const bag = dayTrancheGrid(short, DATE, DUE, SHEET, null).rows[0];
    expect(bag?.mismatch).toBe('Échéances au-delà du prévisionnel : 50 pour 30');
    expect(bag?.cells).toEqual([expect.objectContaining({ quantity: 30 })]);
  });

  it('sans compte à rebours : tout reste « Sans heure », totaux justes', () => {
    const grid = dayTrancheGrid(FORECAST, DATE, null, SHEET, null);
    expect(grid.columns.map((column) => column.label)).toEqual(['Sans heure']);
    expect(grid.rows.map((row) => row.cells[0]?.quantity)).toEqual([312, 2500, 50, 8]);
  });

  it('une case vide vaut null', () => {
    const bag = dayTrancheGrid(FORECAST, DATE, DUE, SHEET, null).rows.find(
      (row) => row.sku === 'BAG',
    );
    expect(bag?.cells).toEqual([expect.objectContaining({ quantity: 50 }), null, null]);
  });
});

describe('slotStateLabel', () => {
  it('dit le retard en minutes', () => {
    expect(slotStateLabel('over', 11)).toBe('Dépassée · 11 min');
  });
});
