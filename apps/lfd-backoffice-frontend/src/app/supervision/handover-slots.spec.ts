import { describe, expect, it } from 'vitest';

import type {
  DaySupervisionView,
  HandoverQueueEntryView,
  HandoverQueueWindowView,
  LateOrder,
} from '@lfd/contracts';

import { handoverBoard, overdueMinutesOf } from './handover-slots';

const DAY = '2026-09-25';

function entry(
  reference: string,
  window: HandoverQueueWindowView | null,
  overrides: Partial<HandoverQueueEntryView> = {},
): HandoverQueueEntryView {
  return {
    orderId: `o-${reference}`,
    reference,
    customerLabel: reference,
    tradeName: null,
    clientele: 'pro',
    pickupLabel: 'Boutique',
    fulfillmentMethod: 'pickup',
    window,
    totalUnits: 4,
    placedAt: 'x',
    state: 'ready',
    handedOverAt: null,
    handedOverVia: null,
    readyAt: null,
    ...overrides,
  };
}

const promised = (start: string | null, end: string): HandoverQueueWindowView => ({
  start,
  end,
  source: 'override',
});

function late(orders: readonly Partial<LateOrder>[], asOf: string): DaySupervisionView {
  return {
    date: DAY,
    asOf,
    flow: [],
    undated: 0,
    late: orders.map((order) => ({
      orderId: 'o',
      reference: 'R',
      customerName: null,
      fulfillmentMethod: 'pickup',
      window: { start: '07:00', end: '08:00', source: 'override' },
      stage: 'ready',
      rule: 'not_handed_over_after_window',
      ...order,
    })),
  };
}

describe('la colonne Retrait / livraison', () => {
  it('groupe par tranche horaire, un créneau sans début tombant avant sa fin', () => {
    const board = handoverBoard(
      {
        day: DAY,
        entries: [
          entry('A', promised('07:15', '07:45')),
          entry('B', promised(null, '08:00')),
          entry('C', promised('08:00', '09:00')),
        ],
      },
      null,
    );

    expect(board.pickup.map((group) => [group.label, group.rows.map((r) => r.reference)])).toEqual([
      ['7 h – 8 h', ['A', 'B']],
      ['8 h – 9 h', ['C']],
    ]);
  });

  it('met l’heure d’ouverture et le sans-créneau à part, en fin, et jamais en retard', () => {
    const board = handoverBoard(
      {
        day: DAY,
        entries: [
          entry('NONE', null),
          entry('OPEN', { start: '07:00', end: '08:00', source: 'default' }),
          entry('H', promised('07:00', '08:00')),
        ],
      },
      late([{ orderId: 'o-OPEN' }, { orderId: 'o-NONE' }], '2026-09-25T08:00:00.000Z'),
    );

    expect(board.pickup.map((group) => group.kind)).toEqual(['hour', 'opening', 'none']);
    expect(board.overdue).toBe(0);
    expect(board.pickup[1]?.rows[0]?.time).toBeNull();
  });

  it('lit le verdict de retard au serveur et calcule seulement sa durée', () => {
    // 06:55 UTC = 8 h 55 à Paris ; le créneau finissait à 8 h.
    const board = handoverBoard(
      {
        day: DAY,
        entries: [entry('L', promised('07:00', '08:00')), entry('OK', promised('07:00', '08:00'))],
      },
      late(
        [{ orderId: 'o-L' }, { orderId: 'o-OK', rule: 'not_ready_before_window' }],
        '2026-09-25T06:55:00.000Z',
      ),
    );

    const rows = board.pickup[0]?.rows ?? [];
    expect(rows.map((row) => row.state)).toEqual(['overdue', 'ready']);
    expect(rows[0]?.overdueMinutes).toBe(55);
    expect(board.overdue).toBe(1);
  });

  it('sans la lecture des retards, ne signale aucun créneau dépassé', () => {
    const board = handoverBoard(
      { day: DAY, entries: [entry('L', promised('07:00', '08:00'))] },
      null,
    );

    expect(board.pickup[0]?.rows[0]?.state).toBe('ready');
  });

  it('compte les attendues hors retirées et annulées, par acheminement', () => {
    const board = handoverBoard(
      {
        day: DAY,
        entries: [
          entry('R', promised('07:00', '08:00'), {
            state: 'handed_over',
            handedOverAt: '2026-09-25T05:04:00.000Z',
          }),
          entry('X', promised('07:00', '08:00'), { state: 'cancelled' }),
          entry('E', promised('07:00', '08:00'), { state: 'expected' }),
          entry('D', promised('07:00', '08:00'), { fulfillmentMethod: 'delivery' }),
        ],
      },
      null,
    );

    expect(board.pickupExpected).toBe(1);
    expect(board.deliveryExpected).toBe(1);
    expect(board.pickup[0]).toMatchObject({ expected: 2, handedOver: 1 });
    expect(board.pickup[0]?.rows.map((row) => row.state)).toEqual([
      'handed_over',
      'cancelled',
      'not_ready',
    ]);
    expect(board.pickup[0]?.rows[0]?.handedOverAt).toBe('7 h 04');
  });

  it('mesure un dépassement entre la fin du créneau et l’instant du serveur', () => {
    expect(overdueMinutesOf(DAY, '08:00', '2026-09-25T06:30:00.000Z')).toBe(30);
    expect(overdueMinutesOf(DAY, '08:00', 'illisible')).toBeNull();
  });
});
