import type { DeliveryRoundView, HandoverQueueWindowView, VehicleView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  broughtBackLabel,
  clockLabel,
  composeDay,
  movedOrder,
  ordersFromOtherDays,
  passageCountLabel,
  roundCountLabel,
  roundLabel,
  shiftedOrder,
  shortRoundLabel,
  signalLabel,
  sortedByWindow,
  stopCountLabel,
  vehiclesActiveOn,
  windowClashes,
  windowShortLabel,
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
    returnedAt: null,
    departedAt: null,
    driver: null,
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
        incidents: [],
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

describe('ordersFromOtherDays (rapportées, decisions-par-defaut § 4)', () => {
  it('nomme les arrêts d’un autre jour et les rapportées à replacer, une fois chacune', () => {
    const stop = (orderId: string, orderDay: string | null) => ({
      stopId: `s-${orderId}`,
      orderId,
      reference: orderId,
      position: 1,
      signals: [],
      orderDay,
    });

    expect(
      ordersFromOtherDays({
        day: '2026-10-01',
        rounds: [
          round({
            stops: [stop('o-day', '2026-10-01'), stop('o-back', '2026-09-30'), stop('o-x', null)],
          }),
        ],
        unassigned: [
          { orderId: 'o-free', reference: 'F' },
          { orderId: 'o-wait', reference: 'W', broughtBackAt: '2026-09-30T15:00:00.000Z' },
          { orderId: 'o-back', reference: 'B', broughtBackAt: '2026-09-30T15:00:00.000Z' },
        ],
        incidents: [],
      }),
    ).toEqual(['o-back', 'o-wait']);
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
    // 23 h 30 UTC le 3 = déjà le 4 à Paris : le jour du badge est celui du dépôt.
    expect(broughtBackLabel('2026-10-03T22:30:00.000Z')).toBe('Rapportée le dimanche 4 octobre');
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

describe('movedOrder (le glisser)', () => {
  const lists = { a: ['1', '2', '3'], b: ['4'] };

  it('monte et descend dans la même liste, en rendant la liste ENTIÈRE (I2)', () => {
    expect(movedOrder(lists, { list: 'a', index: 2 }, { list: 'a', index: 0 })).toEqual({
      a: ['3', '1', '2'],
    });
    expect(movedOrder(lists, { list: 'a', index: 0 }, { list: 'a', index: 2 })).toEqual({
      a: ['2', '3', '1'],
    });
  });

  it('passe dans une autre liste au rang visé, et rend les deux listes touchées', () => {
    expect(movedOrder(lists, { list: 'a', index: 1 }, { list: 'b', index: 0 })).toEqual({
      a: ['1', '3'],
      b: ['2', '4'],
    });
  });

  it('borne aux extrémités : un rang trop grand tombe en fin', () => {
    expect(movedOrder(lists, { list: 'a', index: 0 }, { list: 'b', index: 9 })).toEqual({
      a: ['2', '3'],
      b: ['4', '1'],
    });
    expect(movedOrder(lists, { list: 'a', index: 0 }, { list: 'a', index: 9 })).toEqual({
      a: ['2', '3', '1'],
    });
  });

  it('ne rend rien quand rien ne bouge, ou hors des listes', () => {
    expect(movedOrder(lists, { list: 'a', index: 1 }, { list: 'a', index: 1 })).toBeNull();
    expect(movedOrder(lists, { list: 'a', index: 5 }, { list: 'b', index: 0 })).toBeNull();
    expect(movedOrder(lists, { list: 'a', index: 0 }, { list: 'z', index: 0 })).toBeNull();
  });
});

describe('les fenêtres, au format de l’organisateur', () => {
  it('écrit l’heure sans minutes nulles', () => {
    expect(clockLabel('07:00')).toBe('07 h');
    expect(clockLabel('8:30')).toBe('08 h 30');
    expect(windowShortLabel({ start: '07:00', end: '08:00' })).toBe('7 h 00 – 8 h 00');
    expect(windowShortLabel({ start: null, end: '08:30' })).toBe('avant 8 h 30');
    expect(windowShortLabel(null)).toBe('sans créneau');
  });

  it('nomme une tournée courte, et compte passages et tournées', () => {
    expect(shortRoundLabel({ vehicleName: 'Trafic frigo', passage: 1 })).toBe('Trafic frigo');
    expect(shortRoundLabel({ vehicleName: 'Kangoo blanc', passage: 2 })).toBe('Kangoo · 2');
    expect(passageCountLabel(1)).toBe('1 tournée');
    expect(passageCountLabel(2)).toBe('2 passages');
    expect(roundCountLabel(3)).toBe('3 tournées');
  });
});

describe('sortedByWindow (« Ranger par créneau »)', () => {
  const at = (reference: string, start: string | null, end: string | null) => ({
    reference,
    window: end === null ? null : { start, end },
  });

  it('range par début de fenêtre, la fin à défaut, sans créneau en dernier, stable', () => {
    const sorted = sortedByWindow([
      at('A', '09:00', '10:00'),
      at('B', null, null),
      at('C', null, '08:30'),
      at('D', '07:00', '08:00'),
      at('E', '09:00', '11:00'),
    ]);
    expect(sorted.map((stop) => stop.reference)).toEqual(['D', 'C', 'A', 'E', 'B']);
  });

  it('après le tri, plus de fenêtre intenable sur un jeu sans conflit réel', () => {
    const stops = [at('A', '09:00', '10:00'), at('B', '07:00', '08:00'), at('C', '08:00', '09:00')];
    expect(windowClashes(stops).some((clash) => clash !== null)).toBe(true);
    expect(windowClashes(sortedByWindow(stops)).every((clash) => clash === null)).toBe(true);
  });
});
