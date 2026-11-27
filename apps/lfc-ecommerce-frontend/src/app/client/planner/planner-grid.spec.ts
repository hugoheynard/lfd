import {
  blockingSkusOf,
  cellKey,
  cellOfColumn,
  dayRefusalOf,
  distinctWindows,
  isEditable,
  nearestClose,
  nextDay,
  withQuantity,
} from './planner-grid';
import { lineCheck, plannedColumn, PLANNER_DAY, PLANNER_NEXT_DAY } from './planner.fixture';

const HOUR_MS = 3_600_000;

describe('La grille du planificateur', () => {
  it('compte le lendemain en jours de calendrier, mois et année compris', () => {
    expect(nextDay('2031-03-04')).toBe('2031-03-05');
    expect(nextDay('2031-02-28')).toBe('2031-03-01');
    expect(nextDay('2031-12-31')).toBe('2032-01-01');
  });

  it('range les créneaux sans doublon, dans l’ordre de la journée', () => {
    expect(
      distinctWindows([
        { start: '11:00', end: '12:00' },
        { start: '07:00', end: '09:00' },
        { start: '11:00', end: '12:00' },
      ]),
    ).toEqual([
      { start: '07:00', end: '09:00' },
      { start: '11:00', end: '12:00' },
    ]);
  });

  it('une case se nomme par son jour ET son créneau : deux créneaux, deux paniers', () => {
    expect(cellKey(PLANNER_DAY, { start: '07:00', end: '09:00' })).not.toBe(
      cellKey(PLANNER_DAY, { start: '11:00', end: '12:00' }),
    );
    expect(cellKey(PLANNER_DAY, { start: null, end: '09:00' })).toBe(`${PLANNER_DAY}|-09:00`);
  });

  it('une case ne s’écrit plus après son gel, ni une fois commandée', () => {
    const now = new Date();
    const open = cellOfColumn(
      plannedColumn({ convertsAt: new Date(now.getTime() + HOUR_MS).toISOString() }),
    );
    const frozen = cellOfColumn(
      plannedColumn({ convertsAt: new Date(now.getTime() - HOUR_MS).toISOString() }),
    );
    const placed = cellOfColumn(plannedColumn({ status: 'placed', orderId: 'ord_1' }));

    expect(isEditable(open, now)).toBe(true);
    expect(isEditable(frozen, now)).toBe(false);
    expect(isEditable(placed, now)).toBe(false);
  });

  it('ne grise un jour que pour ce qui tient à l’article et au jour, pas à la quantité', () => {
    const checks = [
      lineCheck({
        day: PLANNER_DAY,
        quantityIndependent: true,
        blocking: { cause: 'deadline_closed', reason: 'Commandes fermées pour ce jour.' },
      }),
      lineCheck({
        day: PLANNER_NEXT_DAY,
        quantityIndependent: false,
        blocking: { cause: 'item_limit_exceeded', reason: 'Au plus 5 par commande.' },
      }),
    ];

    expect(dayRefusalOf(checks, 'VIE-001', PLANNER_DAY)).toBe('Commandes fermées pour ce jour.');
    expect(dayRefusalOf(checks, 'VIE-001', PLANNER_NEXT_DAY)).toBeNull();
    expect(dayRefusalOf(checks, 'PAI-001', PLANNER_DAY)).toBeNull();
  });

  it('relit au plus proche `closesAt` encore à venir, jamais à un instant passé', () => {
    const now = new Date();
    const soon = new Date(now.getTime() + HOUR_MS).toISOString();
    const later = new Date(now.getTime() + 5 * HOUR_MS).toISOString();
    const past = new Date(now.getTime() - HOUR_MS).toISOString();
    const checks = [
      lineCheck({ closesAt: later }),
      lineCheck({ closesAt: past }),
      lineCheck({ closesAt: soon }),
      lineCheck({ closesAt: null }),
    ];

    expect(nearestClose(checks, now)?.toISOString()).toBe(soon);
    expect(nearestClose([lineCheck({ closesAt: past })], now)).toBeNull();
  });

  it('nomme les lignes bloquantes d’une case selon les checks de SA colonne', () => {
    const cell = cellOfColumn(
      plannedColumn({
        lines: [
          { sku: 'VIE-001', quantity: 4 },
          { sku: 'PAI-001', quantity: 2 },
        ],
      }),
    );
    const checks = [
      lineCheck({
        sku: 'PAI-001',
        columnId: 'col_1',
        blocking: { cause: 'unavailable_sku', reason: 'Article retiré.' },
      }),
      lineCheck({
        sku: 'VIE-001',
        columnId: 'col_autre',
        blocking: { cause: 'unavailable_sku', reason: 'Article retiré.' },
      }),
    ];

    expect(blockingSkusOf(checks, cell)).toEqual(['PAI-001']);
  });

  it('pose, change et retire une quantité ; zéro retire la ligne', () => {
    const lines = withQuantity([], 'VIE-001', 6);
    expect(lines).toEqual([{ sku: 'VIE-001', quantity: 6 }]);
    expect(withQuantity(lines, 'VIE-001', 8)).toEqual([{ sku: 'VIE-001', quantity: 8 }]);
    expect(withQuantity(lines, 'VIE-001', 0)).toEqual([]);
  });
});
