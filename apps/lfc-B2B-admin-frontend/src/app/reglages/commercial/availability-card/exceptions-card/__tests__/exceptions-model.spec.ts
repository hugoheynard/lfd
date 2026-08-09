import type { AvailabilityExceptionPayload } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { boundsFor, parisToday, sameExceptions, upcomingExceptions } from '../exceptions-model';

function exception(
  day: string,
  patch: Partial<AvailabilityExceptionPayload> = {},
): AvailabilityExceptionPayload {
  return { day, kind: 'closed', startTime: null, endTime: null, reason: '', ...patch };
}

describe('boundsFor', () => {
  it('propose la matinée et l’après-midi ouvrés', () => {
    expect(boundsFor('closed', 'morning')).toEqual({ startTime: '09:00', endTime: '12:00' });
    expect(boundsFor('closed', 'afternoon')).toEqual({ startTime: '14:00', endTime: '18:00' });
  });

  it('ferme la journée ENTIÈRE sans bornes — ce que le serveur attend', () => {
    expect(boundsFor('closed', 'day')).toEqual({ startTime: null, endTime: null });
  });

  it('borne toujours une ouverture ponctuelle, y compris sur la journée', () => {
    // Sans bornes, une ouverture n'ouvrirait rien de déterminable : le contrat la refuse.
    expect(boundsFor('open', 'day')).toEqual({ startTime: '09:00', endTime: '18:00' });
  });
});

describe('upcomingExceptions', () => {
  const list = [exception('2026-01-05'), exception('2026-08-09'), exception('2026-08-20')];

  it('garde le jour COURANT et ce qui suit, jamais le passé', () => {
    expect(upcomingExceptions(list, '2026-08-09').map(({ exception: e }) => e.day)).toEqual([
      '2026-08-09',
      '2026-08-20',
    ]);
  });

  it('rend l’index d’ORIGINE, pour que retirer vise la bonne ligne', () => {
    // Le passé est masqué : la 1re ligne à l'écran est la 2e du brouillon.
    expect(upcomingExceptions(list, '2026-08-09').map(({ index }) => index)).toEqual([1, 2]);
  });

  it('trie par jour, quel que soit l’ordre de saisie', () => {
    const unsorted = [exception('2026-12-25'), exception('2026-09-01')];
    expect(upcomingExceptions(unsorted, '2026-08-09').map(({ exception: e }) => e.day)).toEqual([
      '2026-09-01',
      '2026-12-25',
    ]);
  });

  it('ne montre rien quand tout est passé', () => {
    expect(upcomingExceptions(list, '2027-01-01')).toEqual([]);
  });
});

describe('sameExceptions', () => {
  it('reconnaît deux listes identiques', () => {
    expect(sameExceptions([exception('2026-08-09')], [exception('2026-08-09')])).toBe(true);
  });

  it('voit un motif, des bornes ou une nature qui changent', () => {
    const base = exception('2026-08-09');
    expect(sameExceptions([base], [{ ...base, reason: 'Congés' }])).toBe(false);
    expect(sameExceptions([base], [{ ...base, kind: 'open' }])).toBe(false);
    expect(sameExceptions([base], [{ ...base, startTime: '09:00', endTime: '12:00' }])).toBe(false);
  });

  it('voit une ligne ajoutée ou retirée', () => {
    expect(sameExceptions([exception('2026-08-09')], [])).toBe(false);
  });
});

describe('parisToday', () => {
  it('rend le jour de PARIS, pas celui d’UTC', () => {
    // 22 h 30 UTC un soir d'été = 00 h 30 le lendemain à Paris.
    expect(parisToday(new Date('2026-08-09T22:30:00.000Z'))).toBe('2026-08-10');
  });

  it('rend le jour au format AAAA-MM-JJ, comparable au contrat', () => {
    expect(parisToday(new Date('2026-01-15T10:00:00.000Z'))).toBe('2026-01-15');
  });
});
