import { describe, expect, it } from 'vitest';

import {
  addressLinesOf,
  dayOfQuery,
  mapHrefOf,
  onSiteLabelOf,
  parisDayOf,
  shiftDay,
  sortStops,
  stateLabelOf,
  stopTitleOf,
  headlineOf,
  roundBadgeOf,
  roundCountLabel,
  longDayOf,
  summaryOf,
  telHrefOf,
  windowLabel,
} from './run-sheet';
import { stopOf } from './run-sheet.fixture';

describe('sortStops', () => {
  it('trie par début de fenêtre, puis « avant X », puis sans fenêtre, puis par référence', () => {
    const sorted = sortStops([
      stopOf({ reference: 'none', window: null }),
      stopOf({ reference: 'before-10', window: { start: null, end: '10:00', source: 'override' } }),
      stopOf({ reference: 'B-9', window: { start: '09:00', end: '11:00', source: 'default' } }),
      stopOf({ reference: 'before-9', window: { start: null, end: '09:00', source: 'override' } }),
      stopOf({ reference: 'A-9', window: { start: '09:00', end: '12:00', source: 'override' } }),
      stopOf({ reference: 'at-7', window: { start: '7:30', end: '8:00', source: 'override' } }),
    ]);

    expect(sorted.map((stop) => stop.reference)).toEqual([
      'at-7',
      'A-9',
      'B-9',
      'before-9',
      'before-10',
      'none',
    ]);
  });

  it('ne touche pas au tableau reçu', () => {
    const stops = [stopOf({ reference: 'B' }), stopOf({ reference: 'A' })];
    sortStops(stops);
    expect(stops.map((stop) => stop.reference)).toEqual(['B', 'A']);
  });
});

describe('libellés', () => {
  it('écrit la fenêtre, bornée ou non', () => {
    expect(windowLabel({ start: '08:00', end: '10:30', source: 'override' })).toBe(
      '8 h 00 – 10 h 30',
    );
    expect(windowLabel({ start: null, end: '10:00', source: 'override' })).toBe('avant 10 h 00');
    expect(windowLabel(null)).toBe('Sans créneau');
  });

  it('nomme les quatre états', () => {
    expect(stateLabelOf('expected').label).toBe('À coliser');
    expect(stateLabelOf('ready').label).toBe('Colisé');
    expect(stateLabelOf('handed_over').label).toBe('Remis');
    expect(stateLabelOf('cancelled').label).toBe('Annulé');
  });

  it('préfère l’enseigne à la raison sociale', () => {
    expect(stopTitleOf(stopOf())).toBe('SARL Le Comptoir');
    expect(stopTitleOf(stopOf({ tradeName: 'Chez Lulu' }))).toBe('Chez Lulu');
  });

  it('écrit l’adresse sans ligne vide, et rien sans adresse', () => {
    expect(addressLinesOf(stopOf())).toEqual(['3 rue des Lilas', '75011 Paris']);
    expect(addressLinesOf(stopOf({ address: null }))).toEqual([]);
  });

  it('compose les liens téléphone et carte', () => {
    expect(telHrefOf('+33 6 12.34.56.78')).toBe('tel:+33612345678');
    expect(mapHrefOf({ lat: 48.85, lng: 2.35 })).toBe(
      'https://www.google.com/maps/search/?api=1&query=48.85,2.35',
    );
  });
});

describe('onSiteLabelOf', () => {
  const book = {
    companyId: 'c-1',
    addressId: 'a-1',
    note: '',
    gps: null,
    procedure: [],
  };

  it('dit le temps sur place propre à l’adresse', () => {
    expect(onSiteLabelOf(stopOf({ addressBook: { ...book, stopMinutes: 20 } }))).toBe(
      '20 min sur place',
    );
  });

  it('se tait quand l’adresse suit le réglage, ou n’est pas reliée', () => {
    expect(onSiteLabelOf(stopOf({ addressBook: book }))).toBeNull();
    expect(onSiteLabelOf(stopOf())).toBeNull();
  });
});

describe('summaryOf', () => {
  it('compte les livraisons, les colisées et les sans-feuille, annulées exclues', () => {
    const summary = summaryOf({
      day: '2026-09-30',
      roundCount: 0,
      stops: [
        stopOf({ state: 'expected', withoutAtelierSheet: true }),
        stopOf({ state: 'ready' }),
        stopOf({ state: 'handed_over' }),
        stopOf({ state: 'cancelled', withoutAtelierSheet: true }),
      ],
    });
    expect(summary).toEqual({ deliveries: 3, packed: 2, withoutAtelierSheet: 1, rounds: 0 });
  });
});

describe('jours', () => {
  it('décale un jour sans passer par l’heure locale', () => {
    expect(shiftDay('2026-10-24', 1)).toBe('2026-10-25');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('lit le jour à Paris, pas en UTC', () => {
    expect(parisDayOf(new Date('2026-09-29T22:30:00.000Z'))).toBe('2026-09-30');
  });

  it('lit le jour de l’URL quand c’est un vrai jour du calendrier', () => {
    expect(dayOfQuery('2026-10-24')).toBe('2026-10-24');
    expect(dayOfQuery('2028-02-29')).toBe('2028-02-29');
  });

  it('refuse sans erreur un jour absent, mal formé ou impossible', () => {
    for (const raw of [
      null,
      undefined,
      '',
      'demain',
      '2026-1-5',
      '2026-13-01',
      '2026-02-30',
      '2026-10-24x',
    ]) {
      expect(dayOfQuery(raw)).toBeNull();
    }
  });
});

describe('longDayOf / headlineOf', () => {
  it('dit le jour en toutes lettres', () => {
    expect(longDayOf('2026-10-07')).toBe('mercredi 7 octobre');
  });

  it('accorde les pluriels', () => {
    expect(headlineOf({ deliveries: 14, packed: 9, withoutAtelierSheet: 0, rounds: 2 })).toBe(
      '14 adresses · 9 colisées · 2 tournées',
    );
    expect(headlineOf({ deliveries: 1, packed: 0, withoutAtelierSheet: 0, rounds: 1 })).toBe(
      '1 adresse · 0 colisée · 1 tournée',
    );
  });

  it('compte les tournées, et dit quand aucune n’est composée', () => {
    expect(roundCountLabel(0)).toBe('aucune tournée composée');
    expect(roundCountLabel(1)).toBe('1 tournée');
    expect(roundCountLabel(3)).toBe('3 tournées');
  });

  it('nomme la tournée et le rang d’un arrêt', () => {
    expect(roundBadgeOf({ roundId: 'r-1', label: 'Kangoo blanc', position: 2 })).toBe(
      'Kangoo blanc · arrêt 2',
    );
  });
});
