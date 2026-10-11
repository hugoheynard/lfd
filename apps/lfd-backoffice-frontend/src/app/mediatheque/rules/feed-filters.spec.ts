import { describe, expect, it } from 'vitest';

import { isFiltering, shotRangeLabel, toPageRequest, withoutFilters } from './feed-filters';
import { ALL_MEDIA } from './media-feed-url';

describe('ce que les critères filtrent', () => {
  it('ne compte pas le tri comme un filtre, et le garde en défaisant les filtres', () => {
    const sorted = { ...ALL_MEDIA, sort: 'shot' as const };
    expect(isFiltering(sorted)).toBe(false);
    expect(isFiltering({ ...sorted, unused: true })).toBe(true);
    expect(withoutFilters({ ...sorted, q: 'pain', tags: ['blé'] })).toEqual(sorted);
  });

  it('demande une page avec le curseur seulement quand il y en a un', () => {
    expect(toPageRequest(ALL_MEDIA, 60, null)).not.toHaveProperty('after');
    expect(toPageRequest({ ...ALL_MEDIA, series: 's1' }, 60, 'c1')).toMatchObject({
      limit: 60,
      after: 'c1',
      series: 's1',
    });
  });

  it('dit la période de prise de vue, d’un jour ou de deux bornes', () => {
    expect(shotRangeLabel(ALL_MEDIA)).toBeNull();
    expect(shotRangeLabel({ ...ALL_MEDIA, shotFrom: '2026-10-03', shotTo: '2026-10-03' })).toBe(
      'Prises le 3 octobre 2026',
    );
    expect(shotRangeLabel({ ...ALL_MEDIA, shotTo: '2026-10-09' })).toBe(
      "Prises jusqu'au 9 octobre 2026",
    );
  });
});
