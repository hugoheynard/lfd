import type { DeliveryRoundView, HandoverQueueWindowView, VehicleView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  composeDay,
  roundLabel,
  shiftedOrder,
  signalLabel,
  stopCountLabel,
  vehiclesActiveOn,
  windowClashes,
} from './delivery-rounds';
import { stopOf } from './run-sheet.fixture';

function w(start: string | null, end: string): HandoverQueueWindowView {
  return { start, end, source: 'override' };
}

function round(overrides: Partial<DeliveryRoundView> = {}): DeliveryRoundView {
  return {
    id: 'r-1',
    vehicleId: 'v-1',
    vehicleName: 'Kangoo',
    passage: 1,
    version: 3,
    vehicleRetired: false,
    departedAt: null,
    stops: [],
    ...overrides,
  };
}

describe('windowClashes (C8)', () => {
  it('signale un arrêt placé après un autre qui ouvre après la fin du sien', () => {
    expect(
      windowClashes([
        { reference: 'A', window: w('10:00', '12:00') },
        { reference: 'B', window: w('08:00', '09:00') },
      ]),
    ).toEqual([null, 'A']);
  });

  it('ne dit rien d’un ordre tenable, ni d’une fenêtre qui touche la fin', () => {
    expect(
      windowClashes([
        { reference: 'A', window: w('08:00', '09:00') },
        { reference: 'B', window: w('09:00', '10:00') },
        { reference: 'C', window: w('09:00', '11:00') },
      ]),
    ).toEqual([null, null, null]);
  });

  it('ne fait bloquer ni un arrêt sans fenêtre, ni une fenêtre sans début', () => {
    expect(
      windowClashes([
        { reference: 'A', window: null },
        { reference: 'B', window: w(null, '12:00') },
        { reference: 'C', window: w('08:00', '09:00') },
        { reference: 'D', window: null },
      ]),
    ).toEqual([null, null, null, null]);
  });
});

describe('composeDay (C16)', () => {
  it('joint par commande, et garde l’arrêt que la feuille du jour ne connaît plus', () => {
    const composed = composeDay(
      {
        day: '2026-10-01',
        rounds: [
          round({
            stops: [
              {
                stopId: 's-1',
                orderId: 'o-late',
                reference: 'CMD-L',
                position: 1,
                signals: [],
                orderDay: '2026-10-01',
              },
              {
                stopId: 's-2',
                orderId: 'o-gone',
                reference: 'CMD-G',
                position: 2,
                signals: ['not_this_day'],
                orderDay: '2026-10-03',
              },
              {
                stopId: 's-3',
                orderId: 'o-early',
                reference: 'CMD-E',
                position: 3,
                signals: [],
                orderDay: '2026-10-01',
              },
            ],
          }),
        ],
        unassigned: [{ orderId: 'o-free', reference: 'CMD-F' }],
      },
      {
        day: '2026-10-01',
        stops: [
          stopOf({ orderId: 'o-late', reference: 'CMD-L', window: w('11:00', '12:00') }),
          stopOf({ orderId: 'o-early', reference: 'CMD-E', window: w('07:00', '08:00') }),
          stopOf({ orderId: 'o-free', reference: 'CMD-F' }),
        ],
      },
    );

    const stops = composed.rounds[0]?.stops ?? [];
    expect(stops.map((line) => line.sheet?.orderId ?? null)).toEqual(['o-late', null, 'o-early']);
    expect(stops.map((line) => line.windowClash)).toEqual([null, null, 'CMD-L']);
    expect(composed.unassigned[0]?.sheet?.orderId).toBe('o-free');
  });
});

describe('shiftedOrder', () => {
  it('rend la permutation COMPLÈTE après une montée ou une descente', () => {
    expect(shiftedOrder(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(shiftedOrder(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
  });

  it('refuse de sortir des bords', () => {
    expect(shiftedOrder(['a', 'b'], 0, -1)).toBeNull();
    expect(shiftedOrder(['a', 'b'], 1, 1)).toBeNull();
  });
});

describe('les libellés', () => {
  it('nomme le passage à partir du second (Q13)', () => {
    expect(roundLabel({ vehicleName: 'Kangoo', passage: 1 })).toBe('Kangoo');
    expect(roundLabel({ vehicleName: 'Kangoo', passage: 2 })).toBe('Kangoo · passage 2');
  });

  it('compte les arrêts', () => {
    expect([0, 1, 4].map(stopCountLabel)).toEqual(['aucun arrêt', '1 arrêt', '4 arrêts']);
  });

  it('dit chaque signal, et le nouveau jour d’une commande déplacée', () => {
    expect(signalLabel('cancelled', null)).toBe('Commande annulée');
    expect(signalLabel('not_delivery', null)).toBe('Passée en retrait au comptoir');
    expect(signalLabel('not_this_day', '2026-10-03')).toBe('Livrée désormais le samedi 3 octobre');
  });
});

describe('vehiclesActiveOn (C14)', () => {
  const vehicle = (id: string, retiredAt: string | null): VehicleView => ({
    id,
    name: id,
    plate: id,
    retiredAt,
    createdAt: '2026-01-01T08:00:00.000Z',
    cargo: null,
    wheelArches: null,
    refrigeration: null,
    energy: null,
  });

  it('propose un véhicule retiré le jour même ou après, pas avant', () => {
    const fleet = [
      vehicle('actif', null),
      // 23 h 30 UTC le 30 = le 1er à Paris : encore utilisable le 1er.
      vehicle('retire-le-jour', '2026-09-30T23:30:00.000Z'),
      vehicle('retire-la-veille', '2026-09-30T12:00:00.000Z'),
    ];
    expect(vehiclesActiveOn(fleet, '2026-10-01').map((v) => v.id)).toEqual([
      'actif',
      'retire-le-jour',
    ]);
  });
});
