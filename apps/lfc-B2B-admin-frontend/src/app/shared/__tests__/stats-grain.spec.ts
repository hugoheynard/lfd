import { describe, expect, it } from 'vitest';

import {
  bucketIndexOf,
  grainBuckets,
  isStatsGrain,
  STATS_GRAIN_SPANS,
} from '../stats-grain/stats-grain';

/** Samedi 15 août 2026, en heure locale — la fenêtre se calcule comme on la dit. */
const TODAY = new Date(2026, 7, 15, 10, 0, 0);

describe('la fenêtre de périodes', () => {
  it('rend la profondeur attachée à chaque granularité', () => {
    expect(grainBuckets('day', TODAY)).toHaveLength(STATS_GRAIN_SPANS.day);
    expect(grainBuckets('week', TODAY)).toHaveLength(8);
    expect(grainBuckets('month', TODAY)).toHaveLength(12);
    expect(grainBuckets('quarter', TODAY)).toHaveLength(8);
    expect(grainBuckets('year', TODAY)).toHaveLength(5);
  });

  it('finit sur la période en cours, pas sur la précédente', () => {
    expect(grainBuckets('day', TODAY).at(-1)?.key).toBe('day-2026-08-15');
    expect(grainBuckets('month', TODAY).at(-1)?.key).toBe('month-2026-08-01');
    expect(grainBuckets('quarter', TODAY).at(-1)?.key).toBe('quarter-2026-07-01');
    expect(grainBuckets('year', TODAY).at(-1)?.key).toBe('year-2026-01-01');
  });

  it('cale la semaine sur le lundi, pas sur le dimanche', () => {
    // 15/08/2026 est un samedi : sa semaine ISO commence le lundi 10.
    expect(grainBuckets('week', TODAY).at(-1)?.key).toBe('week-2026-08-10');
  });

  it('remonte les années sans déraper en franchissant janvier', () => {
    const months = grainBuckets('month', TODAY);

    expect(months.at(0)?.key).toBe('month-2025-09-01');
    expect(months.map((bucket) => bucket.key)).toContain('month-2026-01-01');
  });

  it('colle bout à bout : la fin d’une période est le début de la suivante', () => {
    const quarters = grainBuckets('quarter', TODAY);

    quarters.slice(0, -1).forEach((bucket, index) => {
      expect(bucket.end.getTime()).toBe(quarters[index + 1]?.start.getTime());
    });
  });

  it('place un instant dans sa période, et rend -1 hors fenêtre', () => {
    const days = grainBuckets('day', TODAY);

    expect(bucketIndexOf(days, '2026-08-15T23:59:00')).toBe(6);
    expect(bucketIndexOf(days, '2026-08-09T12:00:00')).toBe(0);
    // La veille du plus ancien jour : dehors, pas rabattue sur le bord.
    expect(bucketIndexOf(days, '2026-08-08T23:59:00')).toBe(-1);
    // Demain : dehors aussi — la fenêtre s'arrête à la période en cours.
    expect(bucketIndexOf(days, '2026-08-16T00:00:00')).toBe(-1);
  });

  it('refuse une granularité inconnue', () => {
    expect(isStatsGrain('month')).toBe(true);
    expect(isStatsGrain('fortnight')).toBe(false);
  });
});
