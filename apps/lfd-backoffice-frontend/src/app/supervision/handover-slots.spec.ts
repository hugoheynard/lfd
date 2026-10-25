import { describe, expect, it } from 'vitest';

import type {
  DaySupervisionView,
  HandoverQueueEntryView,
  HandoverQueueWindowView,
  LateOrder,
} from '@lfd/contracts';

import { causeOf, clockOf, handoverBoard, overdueMinutesOf, UNPLACED_LINE } from './handover-slots';

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
    heldForQuality: false,
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
    awaitingDecision: [],
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
    // Ce qui attend d'abord, le remis et l'annulé en bas (Hugo, 2026-09-28).
    expect(board.pickup[0]?.rows.map((row) => row.state)).toEqual([
      'not_ready',
      'handed_over',
      'cancelled',
    ]);
    expect(board.pickup[0]?.rows[1]?.handedOverAt).toBe('7 h 04');
  });

  it('mesure un dépassement entre la fin du créneau et l’instant du serveur', () => {
    expect(overdueMinutesOf(DAY, '08:00', '2026-09-25T06:30:00.000Z')).toBe(30);
    expect(overdueMinutesOf(DAY, '08:00', 'illisible')).toBeNull();
  });
});

describe('causeOf — qui a dépassé le créneau', () => {
  // 2026-09-25, créneau 07:00–08:00 à Paris : fin = 06:00 UTC (heure d'été).
  const end = '08:00';

  it('prête avant la fin du créneau : c’est le client', () => {
    const ready = entry('A', promised('07:00', end), { readyAt: '2026-09-25T05:40:00.000Z' });

    expect(causeOf(ready, DAY, end)).toBe('customer');
  });

  it('prête APRÈS la fin du créneau : c’est nous', () => {
    const late = entry('B', promised('07:00', end), { readyAt: '2026-09-25T06:20:00.000Z' });

    expect(causeOf(late, DAY, end)).toBe('kitchen');
  });

  it('toujours pas prête : c’est nous', () => {
    expect(causeOf(entry('C', promised('07:00', end), { state: 'expected' }), DAY, end)).toBe(
      'kitchen',
    );
  });
});

describe('handoverBoard — le contrôle qualité', () => {
  /** `plan-controle-qualite.md`, D7 : la retenue est lue telle quelle dans la file. */
  it('porte la retenue sur la ligne et la compte, retrait et livraison confondus', () => {
    const board = handoverBoard(
      {
        day: DAY,
        entries: [
          entry('A', promised('07:00', '08:00'), { heldForQuality: true }),
          entry('B', promised('07:00', '08:00'), {
            heldForQuality: true,
            fulfillmentMethod: 'delivery',
          }),
          entry('C', promised('07:00', '08:00')),
        ],
      },
      null,
    );

    expect(board.held).toBe(2);
    expect(board.pickup[0]?.rows.map((row) => [row.reference, row.heldForQuality])).toEqual([
      ['A', true],
      ['C', false],
    ]);
  });
});

describe('clockOf (Supervision v2, A8)', () => {
  it('rapporte l’heure de lecture au jour montré', () => {
    // 05:55Z = 7 h 55 à Paris en septembre.
    expect(clockOf(DAY, '2026-09-25T05:55:00.000Z')).toEqual({ minutes: 475, label: '7 h 55' });
  });

  it('un autre jour n’a pas de repère : tout passé, ou tout à venir', () => {
    expect(clockOf(DAY, '2026-09-26T05:55:00.000Z')).toEqual({ minutes: Infinity, label: null });
    expect(clockOf(DAY, '2026-09-24T05:55:00.000Z')).toEqual({ minutes: -Infinity, label: null });
  });
});

/**
 * Régression : les 18 livraisons du jour tombaient toutes dans « Heure
 * d'ouverture », heure « — » — une livraison a une échéance, pas un début
 * (Hugo, 2026-10-25).
 */
describe('la colonne Livraison', () => {
  const delivery = (
    reference: string,
    window: HandoverQueueWindowView | null,
    overrides: Partial<HandoverQueueEntryView> = {},
  ) => entry(reference, window, { fulfillmentMethod: 'delivery', pickupLabel: null, ...overrides });
  const before = (end: string): HandoverQueueWindowView => ({
    start: null,
    end,
    source: 'default',
  });

  it('range par échéance, triée, et une vraie tranche par son début — jamais « Heure d’ouverture »', () => {
    const board = handoverBoard(
      {
        day: DAY,
        entries: [
          delivery('B', before('08:00')),
          delivery('T', { start: '13:30', end: '14:30', source: 'override' }),
          delivery('A', before('07:30')),
          delivery('A2', before('07:30')),
        ],
      },
      null,
    );

    expect(
      board.delivery.map((group) => [group.label, group.rows.map((r) => r.reference)]),
    ).toEqual([
      ['Avant 7 h 30', ['A', 'A2']],
      ['Avant 8 h 00', ['B']],
      ['13 h – 14 h', ['T']],
    ]);
    expect(board.delivery.map((group) => group.kind)).not.toContain('opening');
    expect(board.delivery[0]?.rows[0]?.time).toBe('avant 7 h 30');
    expect(board.delivery[2]?.rows[0]?.time).toBe('13 h 30');
  });

  it('garde « Heure d’ouverture » au retrait, où elle a un sens', () => {
    const board = handoverBoard(
      { day: DAY, entries: [entry('OPEN', { start: '07:00', end: '19:00', source: 'default' })] },
      null,
    );
    expect(board.pickup[0]?.label).toBe("Heure d'ouverture");
  });

  it('dit la tournée et l’horaire prévu, ou qu’aucune tournée ne la porte', () => {
    const board = handoverBoard(
      {
        day: DAY,
        entries: [
          delivery('P', before('07:30'), {
            round: {
              label: 'Kangoo blanc',
              position: 3,
              // 04:45 UTC = 6 h 45 à Paris (heure d'été).
              plannedDepartureAt: '2026-09-25T04:45:00.000Z',
              departedAt: null,
              loaded: true,
            },
          }),
          delivery('L', before('07:30'), { round: null }),
        ],
      },
      null,
    );
    const rows = board.delivery[0]?.rows ?? [];

    expect(rows.map((r) => r.roundLine)).toEqual([
      'Kangoo blanc · arrêt 3 · départ prévu 6 h 45',
      UNPLACED_LINE,
    ]);
    expect(rows[0]?.loaded).toBe(true);
  });
});
