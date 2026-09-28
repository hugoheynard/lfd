import { describe, expect, it } from 'vitest';

import type { HandoverBoard } from './handover-slots';
import type { PackingBoard } from './packing-cards';
import { blockersOf, supervisionTabs } from './supervision-tabs';

function packing(overrides: Partial<PackingBoard> = {}): PackingBoard {
  return {
    notClosed: false,
    upcoming: [],
    visible: [],
    overflow: 0,
    packed: [],
    toPack: 0,
    awaitingOven: 0,
    ...overrides,
  };
}

function handover(overrides: Partial<HandoverBoard> = {}): HandoverBoard {
  return {
    pickup: [],
    delivery: [],
    pickupExpected: 0,
    deliveryExpected: 0,
    overdue: 0,
    awaitingPacking: 0,
    ...overrides,
  };
}

describe('blockersOf', () => {
  /** Hugo, 2026-09-28 : « 3 commandes attendent le four », et rien pour le colisage. */
  it('dit combien de commandes attendent le colisage, une fois le plan arrêté', () => {
    const blockers = blockersOf(packing(), handover({ awaitingPacking: 2 }));

    expect(blockers.packing).toBe(2);
    expect(blockers.packingLabel).toBe('2 commandes attendent le colisage');
  });

  it('se tait avant l’arrêt : toute la journée attendrait le colisage', () => {
    expect(blockersOf(packing({ notClosed: true }), handover({ awaitingPacking: 7 })).packing).toBe(
      0,
    );
    expect(blockersOf(null, handover({ awaitingPacking: 7 })).packing).toBe(0);
  });

  it('garde le four et les créneaux dépassés', () => {
    const blockers = blockersOf(packing({ awaitingOven: 1 }), handover({ overdue: 3 }));

    expect(blockers.ovenLabel).toBe('1 commande attend le four');
    expect(blockers.overdueLabel).toBe('3 créneaux dépassés');
  });
});

describe('supervisionTabs', () => {
  it('porte chaque blocage en pastille sur la colonne qui retient', () => {
    const tabs = supervisionTabs(
      { preparation: 4, packing: 5, handover: 6, deliveryNote: null },
      blockersOf(packing({ awaitingOven: 1 }), handover({ awaitingPacking: 2, overdue: 3 })),
    );

    expect(tabs.map((tab) => tab.badge)).toEqual([1, 2, 3]);
  });
});
