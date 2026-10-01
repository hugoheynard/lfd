import type { MyDeliveryRoundView, MyDeliveryStopView } from '@lfd/contracts';

/** Un arrêt de « Ma tournée », complet, dont on ne précise que ce qui compte au test. */
export function myStopOf(overrides: Partial<MyDeliveryStopView> = {}): MyDeliveryStopView {
  const rank = overrides.rank ?? 1;
  return {
    stopId: `s-${String(rank)}`,
    rank,
    reference: `CMD-${String(rank)}`,
    customerLabel: `Client ${String(rank)}`,
    address: {
      label: '',
      ligne1: `${String(rank)} rue du Lac`,
      ligne2: '',
      codePostal: '73320',
      ville: 'Tignes',
      pays: 'FR',
    },
    window: { start: '08:00', end: '10:00', source: 'override' },
    contact: null,
    signatureRequired: false,
    orderNote: '',
    addressNote: null,
    gps: { lat: 45.4, lng: 6.9 + rank / 100 },
    procedure: [],
    bins: 1,
    coldBins: 0,
    closedAt: null,
    ...overrides,
  };
}

/** Une tournée de « Ma tournée », au dépôt par défaut. */
export function myRoundOf(overrides: Partial<MyDeliveryRoundView> = {}): MyDeliveryRoundView {
  return {
    id: 'r-1',
    serviceDay: '2026-10-01',
    vehicleName: 'Kangoo',
    passage: 1,
    version: 3,
    departedAt: null,
    freeze: 'live',
    stops: [myStopOf({ rank: 1 }), myStopOf({ rank: 2 })],
    home: null,
    ...overrides,
  };
}
