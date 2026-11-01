import type {
  ProductionDueThresholdsView,
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

describe('dayTrancheGrid', () => {
  it('jour à venir : des quantités, aucun sorti ni état', () => {
    const grid = dayTrancheGrid(DUE, SHEET, null);
    const cro = grid.groups.flatMap((group) => group.rows).find((row) => row.sku === 'CRO');
    expect(cro?.cells.map((cell) => cell?.label)).toEqual(['20', '100', '180']);
    expect(cro?.cells.every((cell) => cell?.got === null)).toBe(true);
    expect(grid.columns.map((column) => column.state)).toEqual([null, null, null]);
    expect(grid.columns.map((column) => column.label)).toEqual([
      'avant 05:00',
      'avant 09:00',
      'Sans heure',
    ]);
  });

  it('range par rayon, dans l’ordre de la fiche, puis par nom', () => {
    const grid = dayTrancheGrid(DUE, SHEET, null);
    expect(grid.groups.map((group) => group.label)).toEqual(['Viennoiserie', 'Boulangerie']);
    expect(grid.groups[1]?.rows.map((row) => row.sku)).toEqual(['BAG', 'PAIN']);
  });

  it('ne mélange jamais pièces et poids dans un total', () => {
    const grid = dayTrancheGrid(DUE, SHEET, null);
    expect(grid.loads).toEqual([
      { pieces: 70, grams: 0 },
      { pieces: 100, grams: 2500 },
      { pieces: 180, grams: 0 },
    ]);
    expect(grid.total).toEqual({ pieces: 350, grams: 2500 });
    const pain = grid.groups[1]?.rows.find((row) => row.sku === 'PAIN');
    expect(pain?.totalLabel).toBe('2,5 kg');
  });

  it('le jour même : sorti / à sortir et les états de la vue par tranche', () => {
    const grid = dayTrancheGrid(DUE, SHEET, 6 * 60);
    const cro = grid.groups[0]?.rows[0];
    expect(cro?.cells[0]).toMatchObject({ got: 20, progress: '20 / 20', state: 'met' });
    expect(cro?.cells[1]).toMatchObject({ got: 40, progress: '40 / 100', state: 'next' });
    expect(grid.columns[0]).toMatchObject({ state: 'met', stateLabel: 'Tenue' });
    expect(grid.columns[1]).toMatchObject({ state: 'next', stateLabel: 'La prochaine' });
    expect(grid.columns[2]).toMatchObject({ state: 'upcoming', stateLabel: 'À venir' });
  });

  it('signale le besoin d’avant la première tranche', () => {
    const cro = dayTrancheGrid(DUE, SHEET, null).groups[0]?.rows[0];
    expect(cro?.cells[0]?.beforeFirst).toBe('20 attendus à 04:30, avant la première tranche');
    expect(cro?.cells[1]?.beforeFirst).toBeNull();
  });

  it('sans fiche : rangée par nom, sans rayon, unité inconnue hors des totaux', () => {
    const grid = dayTrancheGrid(DUE, null, 6 * 60);
    expect(grid.groups).toHaveLength(1);
    expect(grid.groups[0]?.label).toBeNull();
    expect(grid.groups[0]?.rows.map((row) => row.sku)).toEqual(['BAG', 'CRO', 'PAIN']);
    expect(grid.total).toEqual({ pieces: 0, grams: 0 });
    expect(grid.unknownUnit).toBe(3);
  });

  it('une case vide vaut null', () => {
    const bag = dayTrancheGrid(DUE, SHEET, null).groups[1]?.rows[0];
    expect(bag?.cells).toEqual([expect.objectContaining({ quantity: 50 }), null, null]);
  });
});

describe('slotStateLabel', () => {
  it('dit le retard en minutes', () => {
    expect(slotStateLabel('over', 11)).toBe('Dépassée · 11 min');
  });
});
