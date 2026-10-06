import type { DeliveryRoundView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import type { ComposedDay } from './delivery-rounds';
import {
  alertCountOf,
  boardOfComposed,
  dropTargetOf,
  layoutOps,
  listsOf,
  mapRowPrefixOf,
  orderTagsOf,
  POOL_KEY,
  relaidBoard,
  roundKmLabel,
  roundTimingLabel,
  stopEdgeOf,
  vehicleGroupsOf,
} from './rounds-board-model';
import { stopOf } from './run-sheet.fixture';

function round(overrides: Partial<DeliveryRoundView>): DeliveryRoundView {
  return {
    id: 'r-1',
    vehicleId: 'v-1',
    vehicleName: 'Kangoo blanc',
    passage: 1,
    version: 1,
    vehicleRetired: false,
    planned: null,
    departedAt: null,
    returnedAt: null,
    driver: null,
    stops: [],
    ...overrides,
  };
}

function stopRef(orderId: string, signals: readonly ('cancelled' | 'not_delivery')[] = []) {
  return {
    stopId: `s-${orderId}`,
    orderId,
    reference: `CMD-${orderId}`,
    position: 1,
    signals,
    orderDay: null,
  };
}

/** Kangoo : un passage parti, un en préparation ; Trafic : un seul passage. */
const COMPOSED: ComposedDay = {
  rounds: [
    {
      round: round({ id: 'r-1', departedAt: '2026-10-02T05:02:00.000Z', stops: [stopRef('1')] }),
      stops: [{ stop: stopRef('1'), sheet: null, windowClash: null }],
    },
    {
      round: round({ id: 'r-2', vehicleId: 'v-2', vehicleName: 'Trafic frigo' }),
      stops: [
        { stop: stopRef('2', ['cancelled']), sheet: null, windowClash: null },
        { stop: stopRef('3'), sheet: null, windowClash: 'CMD-2' },
      ],
    },
    { round: round({ id: 'r-3', passage: 2 }), stops: [] },
  ],
  unassigned: [{ order: { orderId: '4', reference: 'CMD-4' }, sheet: null }],
};

describe('le tableau de la composition', () => {
  const board = boardOfComposed(COMPOSED);

  it('gèle une tournée partie, et dit les signaux en toutes lettres', () => {
    expect(board.rounds.map((line) => line.frozen)).toEqual([true, false, false]);
    expect(board.rounds[1]?.stops[0]?.signals).toEqual(['Commande annulée']);
  });

  it('compte ce qui est à régler : fenêtres intenables et signaux', () => {
    expect(board.rounds.map(alertCountOf)).toEqual([0, 2, 0]);
    expect(stopEdgeOf(board.rounds[1]!.stops[0]!)).toBe('alert');
    expect(stopEdgeOf(board.rounds[1]!.stops[1]!)).toBe('warning');
  });

  it('groupe les passages d’un même véhicule, dans l’ordre servi (Q13)', () => {
    const groups = vehicleGroupsOf(board.rounds);
    expect(
      groups.map((group) => [group.vehicleName, group.rounds.map((line) => line.key)]),
    ).toEqual([
      ['Kangoo blanc', ['r-1', 'r-3']],
      ['Trafic frigo', ['r-2']],
    ]);
  });

  it('un onglet envoie en fin du DERNIER passage en préparation ; sans lui, nulle part', () => {
    expect(dropTargetOf(board.rounds, 'v-1')?.key).toBe('r-3');
    const frozenOnly = boardOfComposed({ ...COMPOSED, rounds: COMPOSED.rounds.slice(0, 1) });
    expect(dropTargetOf(frozenOnly.rounds, 'v-1')).toBeNull();
  });

  it('montre un geste avant que le serveur ne l’ait confirmé, fenêtres recalculées', () => {
    const next = relaidBoard(board, { 'r-2': ['3', '2'], 'r-3': [], [POOL_KEY]: ['4'] });
    expect(next.rounds[1]?.stops.map((stop) => stop.orderId)).toEqual(['3', '2']);
    expect(next.rounds[1]?.stops[0]?.windowClash).toBeNull();
    const assigned = relaidBoard(board, { 'r-3': ['4'], [POOL_KEY]: [] });
    expect(assigned.pool).toEqual([]);
    expect(assigned.rounds[2]?.stops[0]).toMatchObject({ orderId: '4', stopId: null });
  });
});

describe('layoutOps', () => {
  const current = listsOf(boardOfComposed(COMPOSED));

  it('affecte depuis « À répartir », déplace d’une tournée à l’autre, retire vers « À répartir »', () => {
    expect(layoutOps(current, { 'r-3': ['4'], [POOL_KEY]: [] })).toEqual([
      { kind: 'assign', orderId: '4', to: 'r-3' },
    ]);
    expect(layoutOps(current, { 'r-2': ['3'], 'r-3': ['2'] })).toEqual([
      { kind: 'move', orderId: '2', from: 'r-2', to: 'r-3' },
    ]);
    expect(layoutOps(current, { 'r-2': ['3'], [POOL_KEY]: ['4', '2'] })).toEqual([
      { kind: 'remove', orderId: '2', from: 'r-2' },
    ]);
  });

  it('un réordonnancement seul ne change personne de tournée', () => {
    expect(layoutOps(current, { 'r-2': ['3', '2'] })).toEqual([]);
  });
});

describe('les cartes', () => {
  it('étiquette une commande non située, et celle que le calcul n’a pas su placer', () => {
    const sheet = stopOf({ state: 'ready' });
    const base = { orderId: '1', reference: 'CMD-1', sheet, broughtBackAt: null };
    expect(orderTagsOf({ ...base, reason: null }).map((tag) => tag.label)).toEqual([
      'Non située · pas de GPS',
    ]);
    expect(orderTagsOf({ ...base, reason: 'overflow' }).map((tag) => tag.label)).toEqual([
      'Ne tient dans aucune tournée (durée max.)',
    ]);
  });

  it('préfixe la liste sous la carte par le passage, ou le véhicule', () => {
    const [first, , second] = boardOfComposed(COMPOSED).rounds;
    expect(mapRowPrefixOf(first!, true, true)).toBe('P1 · ');
    expect(mapRowPrefixOf(second!, false, true)).toBe('Kangoo 2 · ');
    expect(mapRowPrefixOf(first!, false, false)).toBe('');
  });
});

describe('roundKmLabel / roundTimingLabel', () => {
  it('arrondit au kilomètre, et dit « < 1 km » sous le kilomètre', () => {
    expect(roundKmLabel(41_499)).toBe('41 km');
    expect(roundKmLabel(41_500)).toBe('42 km');
    expect(roundKmLabel(999)).toBe('< 1 km');
    expect(roundKmLabel(0)).toBe('< 1 km');
    expect(roundKmLabel(1_000)).toBe('1 km');
    expect(roundKmLabel(1_234_000)).toBe(`${(1234).toLocaleString('fr-FR')} km`);
  });

  it('compose départ, retour et distance', () => {
    expect(
      roundTimingLabel({
        departureTime: '05:40',
        returnTime: '08:15',
        meters: 42_000,
        minutes: 155,
        overDuration: false,
      }),
    ).toBe('Départ 5 h 40 · Retour 8 h 15 · 42 km');
  });
});
