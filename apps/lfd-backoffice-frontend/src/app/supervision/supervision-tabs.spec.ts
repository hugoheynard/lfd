import { describe, expect, it } from 'vitest';

import type { HandoverBoard } from './handover-slots';
import type { PackingBoard } from './packing-cards';
import {
  blockersOf,
  columnBlockersOf,
  columnSubtitlesOf,
  supervisionTabs,
} from './supervision-tabs';

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
    overdueKitchen: 0,
    held: 0,
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

describe('blockersOf — le contrôle qualité', () => {
  /** `plan-controle-qualite.md`, D7 : « N commandes retenues » sur la carte Retrait. */
  it('compte les commandes retenues', () => {
    expect(blockersOf(packing(), handover({ held: 2 })).heldLabel).toBe('2 commandes retenues');
    expect(blockersOf(packing(), handover({ held: 1 })).heldLabel).toBe('1 commande retenue');
    expect(blockersOf(packing(), null).held).toBe(0);
  });
});

describe('supervisionTabs', () => {
  it('porte chaque blocage en pastille sur la colonne qui retient', () => {
    const tabs = supervisionTabs(
      { preparation: 4, packing: 5, handover: 6, deliveryNote: null },
      blockersOf(
        packing({ awaitingOven: 1 }),
        handover({ awaitingPacking: 2, overdue: 2, held: 1 }),
      ),
      null,
    );

    expect(tabs.map((tab) => tab.badge)).toEqual([1, 2, 3]);
    expect(tabs.map((tab) => tab.label)).toEqual(['Prépa 4', 'Colis 5', 'Remise 6']);
  });

  /** Supervision v2, B3 : pendant une mise en avant, la pastille dit ce qu'elle trouve. */
  it('montre les occurrences, pas les blocages, pendant une mise en avant', () => {
    const tabs = supervisionTabs(
      { preparation: 4, packing: 5, handover: 6, deliveryNote: null },
      blockersOf(packing({ awaitingOven: 1 }), handover({ overdue: 3 })),
      { preparation: 0, packing: 2, handover: 1 },
    );

    expect(tabs.map((tab) => tab.badge)).toEqual([null, 2, 1]);
  });

  /** Hugo, 2026-09-28 : le retard du client n'est pas celui du fournil. */
  it('sépare les créneaux dépassés par nous de ceux dépassés par le client', () => {
    const blockers = blockersOf(packing(), handover({ overdue: 3, overdueKitchen: 1 }));

    expect(blockers.overdueKitchenLabel).toBe('1 créneau dépassé par nous');
    expect(blockers.overdueCustomerLabel).toBe('2 clients pas venus');
  });
});

describe('columnBlockersOf', () => {
  it('pose chaque blocage sur sa colonne, et aucune pastille à zéro', () => {
    const pills = columnBlockersOf(
      blockersOf(
        packing({ awaitingOven: 2 }),
        handover({ overdue: 2, overdueKitchen: 1, held: 1 }),
      ),
    );

    expect(pills.preparation.map((pill) => pill.shortLabel)).toEqual(['Four · 2']);
    expect(pills.packing).toEqual([]);
    expect(pills.handover.map((pill) => [pill.key, pill.tone, pill.shortLabel])).toEqual([
      ['kitchen', 'alert', 'Dépassé · 1'],
      ['held', 'alert', 'Retenue · 1'],
      ['customer', 'warning', 'Pas venu · 1'],
    ]);
  });
});

describe('columnSubtitlesOf', () => {
  it('dit le retrait et la livraison, et rien au téléphone pour Retrait', () => {
    const subtitles = columnSubtitlesOf(
      null,
      packing({ awaitingOven: 2, toPack: 5 }),
      handover({ pickupExpected: 12, deliveryExpected: 1 }),
    );

    expect(subtitles.handover).toEqual({ wide: '12 retraits · 1 livraison', narrow: '' });
    expect(subtitles.packing).toEqual({
      wide: '0 colisées · 2 attendent le four',
      narrow: '5 à coliser · 0 prêtes',
    });
  });
});
