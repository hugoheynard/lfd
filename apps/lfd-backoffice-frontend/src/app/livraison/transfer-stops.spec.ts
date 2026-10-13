import { describe, expect, it } from 'vitest';

import type {
  DeliveryLoadingBinView,
  DeliveryLoadingStopView,
  DeliveryLoadingTransferStopView,
  DriverTransferStopView,
  InternalTransferManifestView,
} from '@lfd/contracts';

import { missingByStop } from './delivery-loading-tiles';
import { loadingProgress } from './loading-progress';
import { myStopOf } from './my-round.fixture';
import { interleavedStops, openTransferStops, transferStopLabel } from './my-round-transfers';
import type { BoardRound } from './rounds-board-model';
import { transferTargetsOf } from './rounds-board-view';
import { transferBinsPayload, transferBinsSummary } from './transfer-bins';
import { manifestFreshness, manifestSections } from './transfer-manifest';

/**
 * Les arrêts de transfert interne dans les écrans de la livraison (plan du
 * transfert interne, lots T1–T3) : l'ordre de passage de « Ma tournée », ce
 * qui manque au chargement, le manifeste, et où un arrêt peut aller.
 */

function transferStop(over: Partial<DriverTransferStopView> = {}): DriverTransferStopView {
  return {
    stopId: 'ts_1',
    transferId: 'tr_1',
    position: 2,
    closedAt: null,
    siteLabel: 'Val Village',
    orderCount: 3,
    receivedAt: null,
    totals: [],
    orders: { items: [], totals: [] },
    resupplies: { items: [], totals: [] },
    binCount: 0,
    siteAddress: null,
    siteGps: null,
    ...over,
  };
}

function bin(over: Partial<DeliveryLoadingBinView> = {}): DeliveryLoadingBinView {
  return {
    binId: 'b1',
    code: 'H4N9QC',
    index: 1,
    binTypeName: 'Caisse 40',
    half: null,
    innerBags: 0,
    sharedWithReference: null,
    toRedo: false,
    loadedAt: null,
    ...over,
  };
}

function loadingTransfer(
  over: Partial<DeliveryLoadingTransferStopView> = {},
): DeliveryLoadingTransferStopView {
  return {
    stopId: 'ts_1',
    transferId: 'tr_1',
    siteLabel: 'Val Village',
    position: 2,
    state: 'unlabelled',
    bins: [],
    ...over,
  };
}

function loadingStop(over: Partial<DeliveryLoadingStopView> = {}): DeliveryLoadingStopView {
  return {
    stopId: 's_1',
    orderId: 'o_1',
    reference: 'CMD-1',
    customerLabel: 'Boulangerie Marin',
    position: 1,
    state: 'loaded',
    bins: [bin({ loadedAt: '2026-09-10T05:00:00.000Z' })],
    ...over,
  };
}

describe('interleavedStops', () => {
  it('intercale le transfert à sa position dans la séquence entière', () => {
    const stops = [myStopOf({ stopId: 'a', rank: 1 }), myStopOf({ stopId: 'b', rank: 2 })];
    const entries = interleavedStops(stops, [transferStop({ position: 2 })]);
    expect(entries.map((entry) => entry.stop.stopId)).toEqual(['a', 'ts_1', 'b']);
  });

  it('une tournée dédiée : le transfert seul', () => {
    const entries = interleavedStops([], [transferStop({ position: 1 })]);
    expect(entries.map((entry) => entry.kind)).toEqual(['transfer']);
  });

  it('une position au-delà des commandes tombe en fin, sans rien perdre', () => {
    const entries = interleavedStops(
      [myStopOf({ stopId: 'a', rank: 1 })],
      [transferStop({ position: 9 })],
    );
    expect(entries.map((entry) => entry.stop.stopId)).toEqual(['a', 'ts_1']);
  });

  it('un arrêt de transfert ouvert bloque « Tournée terminée », et se nomme', () => {
    const open = openTransferStops([
      transferStop(),
      transferStop({ stopId: 'ts_2', closedAt: '2026-09-10T07:00:00.000Z' }),
    ]);
    expect(open.map(transferStopLabel)).toEqual(['→ Val Village']);
  });
});

describe('le chargement d’un transfert', () => {
  it('manque sous « → <site> », dans l’ordre de passage', () => {
    const rows = missingByStop({
      stops: [loadingStop({ position: 1, state: 'unlabelled', bins: [] })],
      transferStops: [loadingTransfer({ position: 2 })],
    });
    expect(rows.map((row) => [row.customerLabel, row.status])).toEqual([
      ['Boulangerie Marin', 'aucun bac déclaré'],
      ['→ Val Village', 'aucun bac déclaré'],
    ]);
  });

  it('ses bacs comptent dans l’avancement', () => {
    const progress = loadingProgress([
      loadingStop(),
      loadingTransfer({ state: 'partial', bins: [bin({ binId: 't1' })] }),
    ]);
    expect(progress).toEqual({ loaded: 1, total: 2, stops: 2, stopsLeft: 1 });
  });

  it('dit qu’un transfert sans bac ne partira pas', () => {
    expect(transferBinsSummary(loadingTransfer())).toContain('« Partir » le refuse');
    expect(
      transferBinsSummary(
        loadingTransfer({ bins: [bin(), bin({ binId: 'b2', loadedAt: '2026-09-10T05:00:00Z' })] }),
      ),
    ).toBe('Arrêt 2 · transfert · 2 bacs, 1 chargé');
  });
});

describe('transferBinsPayload', () => {
  it('rien sans format, ni hors des bornes ; sinon la déclaration entière', () => {
    expect(transferBinsPayload(null, 2, 0)).toBeNull();
    expect(transferBinsPayload('bt', 0, 0)).toBeNull();
    expect(transferBinsPayload('bt', 21, 0)).toBeNull();
    expect(transferBinsPayload('bt', 2, 51)).toBeNull();
    expect(transferBinsPayload('bt', 1.5, 0)).toBeNull();
    expect(transferBinsPayload('bt', 2, 3)).toEqual({ binTypeId: 'bt', count: 2, innerBags: 3 });
  });
});

describe('le manifeste', () => {
  const line = { sku: 'PAIN-1', productName: 'Pain', quantity: 4 };
  const view: InternalTransferManifestView = {
    transferId: 'tr_1',
    day: '2026-09-10',
    siteLabel: 'Val Village',
    departedAt: null,
    frozen: false,
    orders: {
      items: [{ itemId: 'i1', kind: 'order', subjectId: 'o1', lines: [line] }],
      totals: [line],
    },
    resupplies: { items: [], totals: [] },
    totals: [line],
  };

  it('n’écrit pas une section vide', () => {
    expect(manifestSections(view).map((s) => [s.title, s.subtitle])).toEqual([
      ['Commandes', '1 commande · 4 pièces'],
    ]);
  });

  it('écrit le réapprovisionnement quand il y en a', () => {
    const withResupply = {
      ...view,
      resupplies: {
        items: [{ itemId: 'i2', kind: 'resupply' as const, subjectId: 'r1', lines: [line] }],
        totals: [line],
      },
    };
    expect(manifestSections(withResupply).map((s) => s.title)).toEqual([
      'Commandes',
      'Réapprovisionnement',
    ]);
  });

  it('dit s’il est figé', () => {
    expect(manifestFreshness({ ...view, frozen: true })).toContain('Figé');
    expect(manifestFreshness(view)).toContain('Calculé');
  });
});

describe('transferTargetsOf', () => {
  function round(over: Partial<BoardRound>): BoardRound {
    return {
      key: 'r1',
      roundId: 'r1',
      vehicleId: 'v1',
      vehicleName: 'Kangoo',
      passage: 1,
      departedAt: null,
      returnedAt: null,
      frozen: false,
      vehicleRetired: false,
      driver: null,
      geometry: null,
      timing: null,
      unknownDemand: 0,
      place: null,
      stops: [],
      ...over,
    };
  }

  it('les autres tournées enregistrées et non parties', () => {
    const targets = transferTargetsOf(
      [
        round({ key: 'r1' }),
        round({ key: 'r2', roundId: 'r2', vehicleName: 'Master' }),
        round({ key: 'r3', roundId: 'r3', frozen: true }),
        round({ key: 'p1', roundId: null }),
      ],
      'r1',
    );
    expect(targets).toEqual([{ value: 'r2', label: 'Master' }]);
  });
});
