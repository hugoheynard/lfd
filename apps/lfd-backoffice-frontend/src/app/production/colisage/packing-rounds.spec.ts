import type { DeliveryPackingRoundView, PackingSheet } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  packingGroups,
  packingRoundTitle,
  readyOrdersLabel,
  sheetsInRoundOrder,
} from './packing-rounds';

function sheet(
  orderId: string,
  fulfillmentMethod: 'pickup' | 'delivery' = 'delivery',
): PackingSheet {
  return {
    orderId,
    reference: `CMD-${orderId}`,
    containers: 0,
    customerLabel: orderId,
    fulfillmentMethod,
    destination: '',
    lines: [],
    lineCount: 0,
    packedLines: 0,
    remainingLines: 0,
    pieces: 0,
    packedPieces: 0,
    canDeclareReady: false,
    packedAt: null,
    packedBy: null,
    packedByName: null,
  };
}

function round(roundId: string, orderIds: readonly string[]): DeliveryPackingRoundView {
  return {
    roundId,
    vehicleName: 'Kangoo',
    passage: 1,
    departedAt: null,
    stopCount: orderIds.length,
    readyStops: 0,
    stops: orderIds.map((orderId, index) => ({
      orderId,
      reference: `CMD-${orderId}`,
      position: orderIds.length - index,
      ready: false,
      binToRedo: false,
    })),
  };
}

describe('le poste rangé par tournée (lot PC2)', () => {
  it('suit l’ordre servi des tournées et de leurs arrêts, puis le reste dans l’ordre servi', () => {
    const sheets = [sheet('a', 'pickup'), sheet('b'), sheet('c'), sheet('d'), sheet('e')];
    const rounds = [round('r1', ['d', 'b']), round('r2', ['c'])];

    expect(sheetsInRoundOrder(sheets, rounds).map((entry) => entry.orderId)).toEqual([
      'd',
      'b',
      'c',
      'a',
      'e',
    ]);
  });

  it('une tournée sans commande dans la pile n’a pas de groupe', () => {
    const groups = packingGroups([sheet('a')], [round('r1', ['z']), round('r2', ['a'])]);

    expect(groups.map((group) => group.round?.roundId ?? null)).toEqual(['r2']);
  });

  it('sans tournée, un seul groupe dans l’ordre servi', () => {
    const groups = packingGroups([sheet('b'), sheet('a')], []);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.round).toBeNull();
    expect(groups[0]?.entries.map((entry) => entry.sheet.orderId)).toEqual(['b', 'a']);
  });

  it('nomme la tournée comme la composition, et dit « partie »', () => {
    expect(packingRoundTitle({ ...round('r', []), passage: 2 })).toBe('Kangoo · passage 2');
    expect(packingRoundTitle({ ...round('r', []), departedAt: '2026-10-01T06:00:00.000Z' })).toBe(
      'Kangoo · partie',
    );
    expect(packingRoundTitle(null)).toBe('Hors tournée');
  });

  it('dit « n commandes prêtes sur m » avec le compte servi', () => {
    expect(readyOrdersLabel({ readyStops: 1, stopCount: 4 })).toBe('1 commande prête sur 4');
    expect(readyOrdersLabel({ readyStops: 3, stopCount: 4 })).toBe('3 commandes prêtes sur 4');
    expect(readyOrdersLabel({ readyStops: 0, stopCount: 4 })).toBe('0 commande prête sur 4');
  });
});
