import type { DeliveryRoundView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import type { ComposedDay } from './delivery-rounds';
import {
  alertCountOf,
  boardOfComposed,
  composedTimingOf,
  dropTargetOf,
  layoutOps,
  listsOf,
  mapRowPrefixOf,
  orderTagsOf,
  OUT_OF_ZONE_LABEL,
  PLACEMENT_LATE_LABEL,
  plannedOfBoard,
  POOL_KEY,
  relaidBoard,
  ZONE_REFUSED_LABEL,
  roundKmLabel,
  roundTimingLabel,
  stopEdgeOf,
  stopTagsOf,
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
    place: null,
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

describe('l’alerte rouge : la place rend l’échéance intenable (CA5)', () => {
  const timing = composedTimingOf([{ id: 'r-2' }], {
    day: '2030-03-12',
    rounds: [
      {
        roundId: 'r-2',
        vehicleId: 'v-2',
        vehicleName: 'Trafic frigo',
        passage: 1,
        departureTime: '05:00',
        returnTime: '08:00',
        meters: 1000,
        minutes: 180,
        overDuration: false,
        geometry: [[5.9, 45.6]],
        stops: [
          {
            orderId: '2',
            reference: 'CMD-2',
            arrival: '06:00',
            window: null,
            windowMissed: false,
            placementLate: false,
          },
          {
            orderId: '3',
            reference: 'CMD-3',
            arrival: '07:00',
            window: null,
            windowMissed: true,
            placementLate: true,
          },
        ],
      },
    ],
  });
  const board = boardOfComposed(COMPOSED, timing);
  const late = board.rounds[1]!.stops[1]!;

  it('lit le chronométrage : tracé par tournée, commandes intenables à leur place', () => {
    expect([...timing.geometries.keys()]).toEqual(['r-2']);
    expect([...timing.placementLate]).toEqual(['3']);
    expect(late.placementLate).toBe(true);
    expect(board.rounds[1]!.stops[0]!.placementLate).toBe(false);
  });

  it('badge rouge, liseré rouge, compté « à régler », marqueur en retard sur la carte', () => {
    expect(stopTagsOf(late)).toContainEqual({ label: PLACEMENT_LATE_LABEL, variant: 'alert' });
    expect(stopEdgeOf(late)).toBe('alert');
    // Annulée (1) + fenêtre intenable C8 (1) + place intenable (1).
    expect(alertCountOf(board.rounds[1]!)).toBe(3);
    expect(plannedOfBoard(board.rounds[1]!).stops[1]?.windowMissed).toBe(true);
  });

  it('un geste en vol efface le rouge jusqu’au prochain chronométrage', () => {
    const next = relaidBoard(board, { 'r-2': ['3', '2'] });
    expect(next.rounds[1]?.stops.some((stop) => stop.placementLate)).toBe(false);
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

  it('dit pourquoi la place a écarté une commande (CA4)', () => {
    const sheet = stopOf({ state: 'ready' });
    const base = { orderId: '1', reference: 'CMD-1', sheet, broughtBackAt: null };
    expect(orderTagsOf({ ...base, reason: 'capacity' }).map((tag) => tag.label)).toEqual([
      'Ne tient dans aucun véhicule (place)',
    ]);
  });

  it('dit qu’aucun véhicule autorisé sur sa zone ne peut prendre la commande (2026-10-06)', () => {
    const sheet = stopOf({ state: 'ready' });
    const base = { orderId: '1', reference: 'CMD-1', sheet, broughtBackAt: null };
    expect(orderTagsOf({ ...base, reason: 'zone' }).map((tag) => tag.label)).toEqual([
      ZONE_REFUSED_LABEL,
    ]);
  });

  it('étiquette l’arrêt enregistré hors des zones de son véhicule, sans le signaler', () => {
    const composed: ComposedDay = {
      rounds: [
        {
          round: round({ stops: [{ ...stopRef('1'), outOfZone: true }, stopRef('2')] }),
          stops: [
            { stop: { ...stopRef('1'), outOfZone: true }, sheet: null, windowClash: null },
            { stop: stopRef('2'), sheet: null, windowClash: null },
          ],
        },
      ],
      unassigned: [],
    };
    const [first, second] = boardOfComposed(composed).rounds[0]?.stops ?? [];
    expect(first?.outOfZone).toBe(true);
    expect(stopTagsOf(first!).map((tag) => tag.label)).toContain(OUT_OF_ZONE_LABEL);
    expect(first?.signals).toEqual([]);
    expect(second?.outOfZone).toBe(false);
    expect(stopTagsOf(second!).map((tag) => tag.label)).not.toContain(OUT_OF_ZONE_LABEL);
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
