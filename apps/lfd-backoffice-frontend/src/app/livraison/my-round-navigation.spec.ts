import { describe, expect, it } from 'vitest';

import {
  driveTargetOf,
  goToHref,
  MAX_URL_LENGTH,
  NAVIGATION_APP_KEY,
  placeOf,
  readNavigationApp,
  remainingStops,
  routeLegs,
  walkToDoorHref,
  writeNavigationApp,
} from './my-round-navigation';
import { myStopOf } from './my-round.fixture';

/** `n` arrêts, rangs 1..n, chacun à un point GPS distinct. */
function stops(n: number) {
  return Array.from({ length: n }, (_, index) =>
    myStopOf({ rank: index + 1, gps: { lat: 45, lng: index + 1 } }),
  );
}

describe('remainingStops', () => {
  it('garde les arrêts non clos, dans l’ordre de passage', () => {
    const list = [
      myStopOf({ rank: 3 }),
      myStopOf({ rank: 1, closedAt: '2026-10-01T07:00:00.000Z' }),
      myStopOf({ rank: 2 }),
    ];
    expect(remainingStops(list).map((stop) => stop.rank)).toEqual([2, 3]);
  });
});

describe('placeOf', () => {
  it('préfère le point GPS, « lat,lng »', () => {
    expect(placeOf({ gps: { lat: 45.5, lng: 6.25 }, address: null })).toBe('45.5,6.25');
  });

  it('retombe sur l’adresse en texte, encodée', () => {
    const stop = myStopOf({ gps: null });
    expect(placeOf(stop)).toBe(encodeURIComponent('1 rue du Lac, 73320 Tignes'));
  });

  it('ne sait pas aller où il n’y a ni point ni adresse', () => {
    expect(placeOf({ gps: null, address: null })).toBeNull();
  });
});

describe('routeLegs — les tronçons de « Toute la tournée »', () => {
  it('un tronçon de 3 étapes + 1 destination, sans origin', () => {
    const [leg, ...rest] = routeLegs(stops(4));
    expect(rest).toEqual([]);
    expect(leg).toEqual({
      href:
        'https://www.google.com/maps/dir/?api=1&destination=45,4' +
        '&waypoints=45,1%7C45,2%7C45,3&travelmode=driving',
      firstRank: 1,
      lastRank: 4,
    });
  });

  it('7 arrêts : 2 tronçons — 1 à 4, puis de 4 vers 5, 6, 7', () => {
    const legs = routeLegs(stops(7));
    expect(legs.map(({ firstRank, lastRank }) => [firstRank, lastRank])).toEqual([
      [1, 4],
      [5, 7],
    ]);
    // Le second part du dernier arrêt du premier.
    expect(legs[1]?.href).toBe(
      'https://www.google.com/maps/dir/?api=1&origin=45,4&destination=45,7' +
        '&waypoints=45,5%7C45,6&travelmode=driving',
    );
  });

  it('9 arrêts : 3 tronçons (4 + 4 + 1)', () => {
    expect(routeLegs(stops(9)).map(({ firstRank, lastRank }) => [firstRank, lastRank])).toEqual([
      [1, 4],
      [5, 8],
      [9, 9],
    ]);
  });

  it('un arrêt seul : une destination, sans étape', () => {
    expect(routeLegs(stops(1))[0]?.href).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=45,1&travelmode=driving',
    );
  });

  it('aucun arrêt : aucun tronçon', () => {
    expect(routeLegs([])).toEqual([]);
  });

  it('écarte l’arrêt dont on ne sait pas où il est', () => {
    const list = [...stops(2), myStopOf({ rank: 3, gps: null, address: null })];
    expect(routeLegs(list).map(({ lastRank }) => lastRank)).toEqual([2]);
  });

  it('découpe davantage quand le lien dépasserait 2 048 caractères', () => {
    const long = 'x'.repeat(600);
    const list = Array.from({ length: 4 }, (_, index) =>
      myStopOf({
        rank: index + 1,
        gps: null,
        address: {
          label: '',
          ligne1: `${String(index)} ${long}`,
          ligne2: '',
          codePostal: '73320',
          ville: 'Tignes',
          pays: 'FR',
        },
      }),
    );
    const legs = routeLegs(list);
    expect(legs.length).toBeGreaterThan(1);
    for (const leg of legs) {
      expect(leg.href.length).toBeLessThanOrEqual(MAX_URL_LENGTH);
    }
    // Chaque arrêt est couvert, dans l'ordre, sans trou.
    expect(legs[0]?.firstRank).toBe(1);
    expect(legs.at(-1)?.lastRank).toBe(4);
  });
});

describe('goToHref — « Y aller »', () => {
  const gps = { gps: { lat: 45.5, lng: 6.9 }, address: null };
  const text = myStopOf({ gps: null });
  const encoded = encodeURIComponent('1 rue du Lac, 73320 Tignes');

  it('Google Maps', () => {
    expect(goToHref('google', gps)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=45.5,6.9&travelmode=driving',
    );
    expect(goToHref('google', text)).toBe(
      `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`,
    );
  });

  it('Waze : `ll` pour un point, `q` pour une adresse', () => {
    expect(goToHref('waze', gps)).toBe('https://waze.com/ul?ll=45.5,6.9&navigate=yes');
    expect(goToHref('waze', text)).toBe(`https://waze.com/ul?q=${encoded}&navigate=yes`);
  });

  it('Apple Plans', () => {
    expect(goToHref('apple', gps)).toBe('https://maps.apple.com/?daddr=45.5,6.9&dirflg=d');
    expect(goToHref('apple', text)).toBe(`https://maps.apple.com/?daddr=${encoded}&dirflg=d`);
  });

  it('rien quand on ne sait pas où aller', () => {
    expect(goToHref('google', { gps: null, address: null })).toBeNull();
  });
});

describe('le choix d’application, sur l’appareil', () => {
  it('Google Maps par défaut, et sur une valeur inconnue', () => {
    expect(readNavigationApp(null)).toBe('google');
    expect(readNavigationApp({ getItem: () => 'tomtom' })).toBe('google');
  });

  it('relit ce qui a été mémorisé', () => {
    const saved = new Map<string, string>();
    writeNavigationApp({ setItem: (key, value) => saved.set(key, value) }, 'waze');
    expect(saved.get(NAVIGATION_APP_KEY)).toBe('waze');
    expect(readNavigationApp({ getItem: (key) => saved.get(key) ?? null })).toBe('waze');
  });

  it('un stockage refusé ne casse rien', () => {
    const refused = (): never => {
      throw new Error('SecurityError');
    };
    expect(readNavigationApp({ getItem: refused })).toBe('google');
    expect(() => {
      writeNavigationApp({ setItem: refused }, 'apple');
    }).not.toThrow();
  });
});

describe('le stationnement (`gps-y-aller-et-position.md`, §6)', () => {
  const DOOR = { lat: 45.5651, lng: 5.9182 };
  const PARKING = { lat: 45.5641, lng: 5.9182 };

  it('« Y aller » conduit au stationnement quand il est connu, sinon à la porte', () => {
    expect(driveTargetOf(myStopOf({ gps: DOOR, parking: PARKING })).gps).toEqual(PARKING);
    expect(driveTargetOf(myStopOf({ gps: DOOR, parking: null })).gps).toEqual(DOOR);
    expect(goToHref('google', driveTargetOf(myStopOf({ gps: DOOR, parking: PARKING })))).toContain(
      'destination=45.5641,5.9182',
    );
  });

  it('« Toute la tournée » passe aussi par les stationnements', () => {
    const [leg] = routeLegs([myStopOf({ rank: 1, gps: DOOR, parking: PARKING })]);
    expect(leg?.href).toContain('destination=45.5641,5.9182');
  });

  it('la fin à pied : du stationnement à la porte, seulement si les deux sont connus', () => {
    expect(walkToDoorHref(myStopOf({ gps: DOOR, parking: PARKING }))).toBe(
      'https://www.google.com/maps/dir/?api=1&origin=45.5641,5.9182&destination=45.5651,5.9182&travelmode=walking',
    );
    expect(walkToDoorHref(myStopOf({ gps: DOOR, parking: null }))).toBeNull();
    expect(walkToDoorHref(myStopOf({ gps: null, parking: PARKING }))).toBeNull();
  });
});
