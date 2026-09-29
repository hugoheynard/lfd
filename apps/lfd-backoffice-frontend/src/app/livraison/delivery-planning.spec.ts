import type {
  DeliveryProposedRoundView,
  DeliveryRoundProposalView,
  DeliveryRoundView,
  DeliveryRoutingSettingsView,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  applyPayloadOfPlan,
  moveStop,
  type PlannedRound,
  type PlannedStop,
  planOf,
  planSummary,
  stopCompanyOf,
  stopFlags,
  stopNameOf,
  stopPlaceOf,
  timingPayloadOf,
  withTimings,
} from './delivery-planning';
import type { ComposedDay } from './delivery-rounds';
import { stopOf } from './run-sheet.fixture';

const SETTINGS: DeliveryRoutingSettingsView = {
  detourPercent: 140,
  averageSpeedKmh: 35,
  earliestDeparture: '07:00',
  maxRoundMinutes: 240,
  stopMinutes: 5,
  defaultMode: 'insert',
  multiplePassages: true,
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
  vehicleRetired: false,
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

describe('planOf', () => {
  it('joint le nom et le lieu par commande, jamais la référence en premier', () => {
    const [first] = plan();
    const joined = first!.stops[0]!;

    // Régression : « Le Chalet » (seconde adresse du client) s'affichait du nom de la société.
    expect(stopNameOf(joined)).toBe('Le Chalet');
    expect(stopCompanyOf(joined)).toBe('La Folie Douce Val d’Isère');
    expect(stopPlaceOf(joined)).toBe('3 rue des Lilas, Paris');
    // Absente de la feuille de route : la référence, faute de mieux.
    expect(stopNameOf(first!.stops[1]!)).toBe('CMD-2');
  });

  it('montre la tournée chargée, verrouillée, avec ses arrêts lus dans la composition', () => {
    const loaded = plan().find((round) => round.key === 'r-9');

    expect(loaded).toMatchObject({ lock: 'loaded', kept: true, timing: null, vehicleId: 'v-3' });
    expect(loaded?.stops.map((line) => line.orderId)).toEqual(['o-9']);
  });
});

describe('stopNameOf', () => {
  it('sans libellé d’adresse : la raison sociale, sans la répéter en second', () => {
    const line = stop({ sheet: stopOf({ customerLabel: 'SARL Le Comptoir' }) });

    expect(stopNameOf(line)).toBe('SARL Le Comptoir');
    expect(stopCompanyOf(line)).toBeNull();
  });
});

describe('moveStop', () => {
  it('glisse un arrêt vers une autre camionnette, et efface les heures des deux colonnes', () => {
    const next = moveStop(plan(), { key: 'r-1', index: 0 }, { key: 'new:v-2:1', index: 1 });

    const [source, target] = next ?? [];
    expect(source?.stops.map((line) => line.orderId)).toEqual(['o-2']);
    expect(target?.stops.map((line) => line.orderId)).toEqual(['o-3', 'o-1']);
    expect(source).toMatchObject({ timing: null, geometry: null, touched: true });
    expect(target?.stops.every((line) => line.arrival === null)).toBe(true);
  });

  it('réordonne dans la colonne', () => {
    const next = moveStop(plan(), { key: 'r-1', index: 1 }, { key: 'r-1', index: 0 });

    expect(next?.[0]?.stops.map((line) => line.orderId)).toEqual(['o-2', 'o-1']);
  });

  it('ne fait rien quand l’arrêt retombe à sa place', () => {
    expect(moveStop(plan(), { key: 'r-1', index: 1 }, { key: 'r-1', index: 1 })).toBeNull();
  });

  it('refuse une tournée chargée : ni vers elle, ni hors d’elle (I6)', () => {
    expect(moveStop(plan(), { key: 'r-1', index: 0 }, { key: 'r-9', index: 0 })).toBeNull();
    expect(moveStop(plan(), { key: 'r-9', index: 0 }, { key: 'r-1', index: 0 })).toBeNull();
  });
});

describe('chronométrer', () => {
  it('n’envoie que les colonnes touchées, sans celles qu’un glisser a vidées', () => {
    const emptied = moveStop(plan(), { key: 'new:v-2:1', index: 0 }, { key: 'r-1', index: 0 });

    expect(timingPayloadOf('2026-10-01', emptied ?? [], ['new:v-2:1', 'r-1'])).toEqual({
      day: '2026-10-01',
      rounds: [{ roundId: 'r-1', vehicleId: 'v-1', orderIds: ['o-3', 'o-1', 'o-2'] }],
    });
  });

  it('pose les heures rendues, et ignore une réponse qu’un glisser plus récent a rendue caduque', () => {
    const moved = moveStop(plan(), { key: 'r-1', index: 1 }, { key: 'r-1', index: 0 }) ?? [];
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

    const timed = withTimings(moved, sent, view);
    expect(timed[0]?.timing?.departureTime).toBe('06:10');
    expect(timed[0]?.stops.map((line) => line.arrival)).toEqual(['06:15', '06:30']);

    const movedAgain = moveStop(moved, { key: 'r-1', index: 1 }, { key: 'r-1', index: 0 }) ?? [];
    expect(withTimings(movedAgain, sent, view)[0]?.timing).toBeNull();
  });
});

describe('applyPayloadOfPlan', () => {
  it('envoie la composition éditée, sans la tournée chargée, avec toutes les versions lues', () => {
    const moved = moveStop(plan(), { key: 'r-1', index: 0 }, { key: 'new:v-2:1', index: 0 }) ?? [];

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
    const emptied =
      moveStop(plan(), { key: 'new:v-2:1', index: 0 }, { key: 'r-1', index: 2 }) ?? [];

    expect(applyPayloadOfPlan(PROPOSAL, emptied).rounds.map((round) => round.roundId)).toEqual([
      'r-1',
    ]);
  });
});

describe('stopFlags', () => {
  it('écrit les problèmes sur la ligne', () => {
    const flags = stopFlags(
      stop({
        arrival: '07:04',
        window: { start: '08:00', end: '09:00' },
        windowMissed: true,
        sheet: stopOf({
          state: 'expected',
          signatureRequired: true,
          addressBook: {
            companyId: 'co-1',
            addressId: 'a-1',
            note: '',
            gps: null,
            procedure: [
              { id: 'st-1', title: 'Sonner', body: '', hasPhoto: false, photoRevision: null },
              { id: 'st-2', title: 'Poser', body: '', hasPhoto: false, photoRevision: null },
            ],
          },
        }),
      }),
    ).map((flag) => flag.label);

    expect(flags).toEqual([
      'Arrive après son créneau',
      'Attend 56 min l’ouverture',
      'Pas encore prête',
      'Signature exigée',
      'Procédure en 2 étapes',
    ]);
  });

  it('ne signale pas une attente de moins de 20 min, ni un arrêt sans heures', () => {
    expect(stopFlags(stop({ arrival: '07:45', window: { start: '08:00', end: '09:00' } }))).toEqual(
      [],
    );
    expect(stopFlags(stop({ arrival: null, window: { start: '08:00', end: '09:00' } }))).toEqual(
      [],
    );
  });
});

describe('planSummary', () => {
  it('compte livraisons, camionnettes, hors créneau et pas prêtes', () => {
    expect(planSummary(plan())).toEqual({ deliveries: 4, vans: 3, late: 1, notReady: 2 });
  });
});
