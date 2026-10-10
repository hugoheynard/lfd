import type { LibraryMediaView } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import { feedRows, type FeedRow } from './month-dividers';

function deposited(url: string, depositedAt: string): LibraryMediaView {
  return {
    url,
    name: '',
    uses: 0,
    tags: [],
    alt: { fr: url },
    focal: null,
    width: null,
    height: null,
    bytes: null,
    contentType: null,
    depositedAt,
    series: null,
  };
}

function labels(rows: readonly FeedRow[]): string[] {
  return rows.map((row) => (row.kind === 'divider' ? `# ${row.label}` : row.item.url));
}

// Les dates ne sont comparées qu'ENTRE ELLES et au fuseau, jamais à
// l'horloge : elles sont le sujet du test (CLAUDE.md §5, l'exception étroite).
describe('les intercalaires de mois', () => {
  it('posent un en-tête à chaque bascule de mois', () => {
    const rows = feedRows(
      [
        deposited('a', '2026-10-09T08:00:00.000Z'),
        deposited('b', '2026-10-02T08:00:00.000Z'),
        deposited('c', '2026-09-20T08:00:00.000Z'),
      ],
      'deposited',
    );
    expect(labels(rows)).toEqual(['# Octobre 2026', 'a', 'b', '# Septembre 2026', 'c']);
  });

  it('sont absents hors du tri par dépôt', () => {
    const items = [
      deposited('a', '2026-10-09T08:00:00.000Z'),
      deposited('b', '2026-09-20T08:00:00.000Z'),
    ];
    expect(labels(feedRows(items, 'name'))).toEqual(['a', 'b']);
    expect(labels(feedRows(items, 'uses'))).toEqual(['a', 'b']);
  });

  it('lisent le mois à l’heure de PARIS, pas en UTC', () => {
    // 30 septembre 22 h 30 UTC = 1er octobre 0 h 30 à Paris (heure d'été).
    // 31 décembre 23 h 30 UTC = 1er janvier 0 h 30 à Paris (heure d'hiver).
    const rows = feedRows(
      [
        deposited('octobre', '2026-09-30T22:30:00.000Z'),
        deposited('septembre', '2026-09-30T21:30:00.000Z'),
        deposited('janvier', '2026-12-31T23:30:00.000Z'),
      ],
      'deposited',
    );
    expect(labels(rows)).toEqual([
      '# Octobre 2026',
      'octobre',
      '# Septembre 2026',
      'septembre',
      '# Janvier 2027',
      'janvier',
    ]);
  });

  it('donnent des clés distinctes des images', () => {
    const rows = feedRows([deposited('a', '2026-10-09T08:00:00.000Z')], 'deposited');
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
  });
});

function inSeries(
  url: string,
  series: { id: string; title: string; shotOn: string | null } | null,
): LibraryMediaView {
  return { ...deposited(url, '2026-10-09T08:00:00.000Z'), series };
}

describe('les intercalaires de série', () => {
  const carte = { id: 's1', title: 'Shooting carte 2026', shotOn: '2026-03-14' };
  const atelier = { id: 's2', title: 'Atelier', shotOn: null };

  it('posent la série (titre · mois) sous le tri par prise de vue', () => {
    const rows = feedRows(
      [inSeries('a', carte), inSeries('b', carte), inSeries('c', atelier), inSeries('d', null)],
      'shot',
    );
    expect(labels(rows)).toEqual([
      '# Shooting carte 2026 · mars 2026',
      'a',
      'b',
      '# Atelier',
      'c',
      '# Sans série',
      'd',
    ]);
  });

  it('ne fondent pas deux séries homonymes sous un seul intercalaire', () => {
    const twin = { ...atelier, id: 's3' };
    const rows = feedRows([inSeries('a', atelier), inSeries('b', twin)], 'shot');
    expect(labels(rows)).toEqual(['# Atelier', 'a', '# Atelier', 'b']);
  });

  it('ne regroupent jamais par série sous le tri par dépôt', () => {
    const rows = feedRows([inSeries('a', carte), inSeries('b', atelier)], 'deposited');
    expect(labels(rows)).toEqual(['# Octobre 2026', 'a', 'b']);
  });
});
