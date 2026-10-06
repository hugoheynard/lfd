import type {
  DeliveryProposedRoundView,
  DeliveryRoundProposalView,
  DeliveryRoundView,
  DeliveryRoutingSettingsView,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  applyPayloadOfPlan,
  type PlannedRound,
  type PlannedStop,
  planOf,
  planSummary,
  planWithLists,
  roundColor,
  stopNameOf,
  timingPayloadOf,
  vehicleColors,
  withTimings,
} from './delivery-planning';
import { type ComposedDay, movedOrder } from './delivery-rounds';
import { boardOfPlan, stopTagsOf, unverifiedPlaceLabel } from './rounds-board-model';
import { stopOf } from './run-sheet.fixture';

const SETTINGS: DeliveryRoutingSettingsView = {
  detourPercent: 140,
  averageSpeedKmh: 35,
  earliestDeparture: '07:00',
  maxRoundMinutes: 240,
  stopMinutes: 5,
  safetyMarginMinutes: 20,
  defaultMode: 'insert',
  multiplePassages: true,
  defaultContainer: null,
  source: 'default',
};

function proposed(overrides: Partial<DeliveryProposedRoundView>): DeliveryProposedRoundView {
  return {
    roundId: 'r-1',
    vehicleId: 'v-1',
    vehicleName: 'Camionnette 1',
    passage: 1,
    departureTime: '06:00',
    returnTime: '08:26',
    meters: 12_100,
    minutes: 146,
    overDuration: false,
    geometry: [
      [6.98, 45.44],
      [6.99, 45.45],
    ],
    stops: [
      { orderId: 'o-1', reference: 'CMD-1', arrival: '06:01', window: null, windowMissed: false },
      { orderId: 'o-2', reference: 'CMD-2', arrival: '06:20', window: null, windowMissed: true },
    ],
    ...overrides,
  };
}

const PROPOSAL: DeliveryRoundProposalView = {
  day: '2026-10-01',
  estimate: 'road',
  mode: 'new_rounds',
  departurePoint: { pickupAddressId: 'p-1', label: 'Labo', gps: { lat: 45.44, lng: 6.98 } },
  settings: SETTINGS,
  rounds: [
    proposed({}),
    proposed({
      roundId: null,
      vehicleId: 'v-2',
      vehicleName: 'Camionnette 2',
      stops: [
        { orderId: 'o-3', reference: 'CMD-3', arrival: '07:00', window: null, windowMissed: false },
      ],
    }),
  ],
  unlocated: [],
  overflow: [],
  unfit: [],
  unknownDemand: [],
  defaultDemand: [],
  kept: [{ roundId: 'r-9', vehicleName: 'Camionnette 3', passage: 1, reason: 'loaded' }],
  versions: [
    { roundId: 'r-1', version: 4 },
    { roundId: 'r-9', version: 2 },
  ],
};

const LOADED_ROUND: DeliveryRoundView = {
  id: 'r-9',
  vehicleId: 'v-3',
  vehicleName: 'Camionnette 3',
  passage: 1,
  version: 2,
  planned: null,
  vehicleRetired: false,
  returnedAt: null,
  driver: null,
  departedAt: null,
  stops: [
    {
      stopId: 's-9',
      orderId: 'o-9',
      reference: 'CMD-9',
      position: 1,
      signals: [],
      orderDay: '2026-10-01',
    },
  ],
};

const COMPOSED: ComposedDay = {
  rounds: [
    {
      round: LOADED_ROUND,
      stops: [
        {
          stop: LOADED_ROUND.stops[0]!,
          sheet: stopOf({ orderId: 'o-9', reference: 'CMD-9', tradeName: 'Le Refuge' }),
          windowClash: null,
        },
      ],
    },
  ],
  unassigned: [
    {
      order: { orderId: 'o-1', reference: 'CMD-1' },
      sheet: stopOf({
        orderId: 'o-1',
        reference: 'CMD-1',
        tradeName: 'La Folie Douce Val d’Isère',
        address: {
          label: 'Le Chalet',
          ligne1: '3 rue des Lilas',
          ligne2: '',
          codePostal: '73700',
          ville: 'Paris',
          pays: 'FR',
        },
      }),
    },
  ],
};

function stop(overrides: Partial<PlannedStop>): PlannedStop {
  return {
    orderId: 'o-1',
    reference: 'CMD-1',
    arrival: '07:00',
    window: null,
    windowMissed: false,
    sheet: null,
    ...overrides,
  };
}

const plan = (): readonly PlannedRound[] => planOf(PROPOSAL, COMPOSED);

/** Un glisser dans l'aperçu, comme le tableau le fait : les listes, puis la composition. */
function glide(
  rounds: readonly PlannedRound[],
  from: { readonly key: string; readonly index: number },
  to: { readonly key: string; readonly index: number },
): readonly PlannedRound[] | null {
  const lists = Object.fromEntries(
    rounds.map((round) => [round.key, round.stops.map((line) => line.orderId)]),
  );
  const next = movedOrder(
    lists,
    { list: from.key, index: from.index },
    { list: to.key, index: to.index },
  );
  const stops = new Map(
    rounds.flatMap((round) => round.stops.map((line) => [line.orderId, line] as const)),
  );
  return next === null ? null : planWithLists(rounds, next, stops);
}

describe('planOf', () => {
  it('joint le nom et le lieu par commande, jamais la référence en premier', () => {
    const [first] = plan();
    const joined = first!.stops[0]!;

    // Régression : « Le Chalet » (seconde adresse du client) s'affichait du nom de la société.
    expect(stopNameOf(joined)).toBe('Le Chalet');
    // Absente de la feuille de route : la référence, faute de mieux.
    expect(stopNameOf(first!.stops[1]!)).toBe('CMD-2');
  });

  it('montre la tournée chargée, verrouillée, avec ses arrêts lus dans la composition', () => {
    const loaded = plan().find((round) => round.key === 'r-9');

    expect(loaded).toMatchObject({ lock: 'loaded', kept: true, timing: null, vehicleId: 'v-3' });
    expect(loaded?.stops.map((line) => line.orderId)).toEqual(['o-9']);
  });
});

describe('la place non vérifiée (2026-10-06)', () => {
  it('compte, colonne par colonne, les commandes placées sans bacs connus', () => {
    const proposal = { ...PROPOSAL, unknownDemand: [{ orderId: 'o-2', reference: 'CMD-2' }] };
    const board = boardOfPlan(planOf(proposal, null), [], null, proposal);
    expect(board.rounds.map((round) => [round.key, round.unknownDemand])).toEqual([
      ['r-1', 1],
      ['new:v-2:1', 0],
      ['r-9', 0],
    ]);
    expect(board.rounds.map(unverifiedPlaceLabel)).toEqual([
      'Place non vérifiée — 1 commande sans bacs connus',
      null,
      null,
    ]);
  });
});

describe('stopNameOf', () => {
  it('sans libellé d’adresse : la raison sociale', () => {
    const line = stop({ sheet: stopOf({ customerLabel: 'SARL Le Comptoir' }) });

    expect(stopNameOf(line)).toBe('SARL Le Comptoir');
  });
});

describe('planWithLists', () => {
  const stops = (): ReadonlyMap<string, PlannedStop> =>
    new Map(plan().flatMap((round) => round.stops.map((line) => [line.orderId, line] as const)));

  it('glisse un arrêt vers une autre camionnette, et efface les heures des deux colonnes', () => {
    const next = planWithLists(plan(), { 'r-1': ['o-2'], 'new:v-2:1': ['o-3', 'o-1'] }, stops());

    const [source, target] = next ?? [];
    expect(source?.stops.map((line) => line.orderId)).toEqual(['o-2']);
    expect(target?.stops.map((line) => line.orderId)).toEqual(['o-3', 'o-1']);
    expect(source).toMatchObject({ timing: null, geometry: null, touched: true });
    expect(target?.stops.every((line) => line.arrival === null)).toBe(true);
  });

  it('réordonne dans la colonne, sans toucher aux autres', () => {
    const before = plan();
    const next = planWithLists(before, { 'r-1': ['o-2', 'o-1'] }, stops());

    expect(next?.[0]?.stops.map((line) => line.orderId)).toEqual(['o-2', 'o-1']);
    expect(next?.[1]).toBe(before[1]);
  });

  it('refuse une tournée chargée (I6), et une commande sans arrêt connu', () => {
    expect(planWithLists(plan(), { 'r-9': ['o-9', 'o-1'] }, stops())).toBeNull();
    expect(planWithLists(plan(), { 'r-1': ['o-404'] }, stops())).toBeNull();
  });
});

describe('chronométrer', () => {
  it('n’envoie que les colonnes touchées, sans celles qu’un glisser a vidées', () => {
    const emptied = glide(plan(), { key: 'new:v-2:1', index: 0 }, { key: 'r-1', index: 0 });

    expect(timingPayloadOf('2026-10-01', emptied ?? [], ['new:v-2:1', 'r-1'])).toEqual({
      day: '2026-10-01',
      rounds: [{ roundId: 'r-1', vehicleId: 'v-1', orderIds: ['o-3', 'o-1', 'o-2'] }],
    });
  });

  it('pose les heures rendues, et ignore une réponse qu’un glisser plus récent a rendue caduque', () => {
    const moved = glide(plan(), { key: 'r-1', index: 1 }, { key: 'r-1', index: 0 }) ?? [];
    const sent = timingPayloadOf('2026-10-01', moved, ['r-1'])!;
    const view = {
      day: '2026-10-01',
      rounds: [
        proposed({
          departureTime: '06:10',
          stops: [
            {
              orderId: 'o-2',
              reference: 'CMD-2',
              arrival: '06:15',
              window: null,
              windowMissed: false,
            },
            {
              orderId: 'o-1',
              reference: 'CMD-1',
              arrival: '06:30',
              window: null,
              windowMissed: false,
            },
          ],
        }),
      ],
    };

    // Le chronométrage dit en plus, par arrêt, l'alerte rouge (CA5) : aucune ici.
    const timedView = {
      ...view,
      rounds: view.rounds.map((round) => ({
        ...round,
        stops: round.stops.map((stop) => ({ ...stop, placementLate: false })),
      })),
    };
    const timed = withTimings(moved, sent, timedView);
    expect(timed[0]?.timing?.departureTime).toBe('06:10');
    expect(timed[0]?.stops.map((line) => line.arrival)).toEqual(['06:15', '06:30']);

    const movedAgain = glide(moved, { key: 'r-1', index: 1 }, { key: 'r-1', index: 0 }) ?? [];
    expect(withTimings(movedAgain, sent, timedView)[0]?.timing).toBeNull();
  });
});

describe('applyPayloadOfPlan', () => {
  it('envoie la composition éditée, sans la tournée chargée, avec toutes les versions lues', () => {
    const moved = glide(plan(), { key: 'r-1', index: 0 }, { key: 'new:v-2:1', index: 0 }) ?? [];

    expect(applyPayloadOfPlan(PROPOSAL, moved)).toEqual({
      day: '2026-10-01',
      rounds: [
        { roundId: 'r-1', vehicleId: 'v-1', orderIds: ['o-2'] },
        { roundId: null, vehicleId: 'v-2', orderIds: ['o-1', 'o-3'] },
      ],
      versions: [
        { roundId: 'r-1', version: 4 },
        { roundId: 'r-9', version: 2 },
      ],
    });
  });

  it('n’ouvre pas une tournée qu’on a vidée', () => {
    const emptied = glide(plan(), { key: 'new:v-2:1', index: 0 }, { key: 'r-1', index: 2 }) ?? [];

    expect(applyPayloadOfPlan(PROPOSAL, emptied).rounds.map((round) => round.roundId)).toEqual([
      'r-1',
    ]);
  });
});

describe('planSummary', () => {
  it('compte livraisons, camionnettes, tournées, distance, hors créneau et pas prêtes', () => {
    // Deux tournées proposées chronométrées à 12,1 km ; la gardée n'a pas d'heures.
    expect(planSummary(plan())).toEqual({
      deliveries: 4,
      vans: 3,
      late: 1,
      notReady: 2,
      meters: 24_200,
      rounds: 3,
    });
  });
});

describe('roundColor', () => {
  it('partage la roue également : trois véhicules sont à 120° les uns des autres', () => {
    const hues = [0, 1, 2].map((rank) =>
      Number(roundColor(rank, 3).split(' ')[2]?.replace(')', '')),
    );
    expect(hues).toEqual([45, 165, 285]);
  });

  it('garde luminosité et saturation fixes : aucune tournée ne domine', () => {
    expect(roundColor(0, 2)).toMatch(/^oklch\(0\.63 0\.17 /u);
    expect(roundColor(1, 2)).toMatch(/^oklch\(0\.63 0\.17 225\.0\)$/u);
  });
});

describe('vehicleColors', () => {
  it('donne à chaque véhicule son cran de la roue, une fois, quel que soit le nombre de passages', () => {
    const colors = vehicleColors(['v-1', 'v-2', 'v-1']);

    expect(colors.size).toBe(2);
    expect(colors.get('v-1')).toBe(roundColor(0, 2));
    expect(colors.get('v-2')).toBe(roundColor(1, 2));
  });
});

describe('le contenant par défaut (2026-10-06)', () => {
  it('dit « par défaut » sur l’arrêt compté au défaut, et ne le compte pas « non vérifié »', () => {
    const proposal = {
      ...PROPOSAL,
      defaultDemand: [
        { orderId: 'o-2', reference: 'CMD-2', binTypeName: 'Manne', count: 1, withEstimate: false },
      ],
    };
    const board = boardOfPlan(planOf(proposal, null), [], null, proposal);
    const stop = board.rounds.flatMap((round) => round.stops).find((s) => s.orderId === 'o-2');

    expect(stop?.defaultDemand).toBe('1 × Manne (par défaut)');
    expect(stop === undefined ? [] : stopTagsOf(stop)).toContainEqual({
      label: '1 × Manne (par défaut)',
      variant: 'neutral',
    });
    expect(board.rounds.map(unverifiedPlaceLabel)).toEqual([null, null, null]);
  });
});
