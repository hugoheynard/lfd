import { convertToParamMap } from '@angular/router';
import { describe, expect, it } from 'vitest';

import {
  ALL_MEDIA,
  isFiltering,
  readCriteria,
  sameCriteria,
  shotRangeLabel,
  toPageRequest,
  toQueryParams,
  withoutFilters,
  type MediaFeedCriteria,
} from './media-feed-url';

/** Ce que `queryParamsHandling: 'merge'` laisse dans l'adresse : les clés non nulles. */
function address(criteria: MediaFeedCriteria): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const [key, value] of Object.entries(toQueryParams(criteria))) {
    if (typeof value === 'string') {
      kept[key] = value;
    }
  }
  return kept;
}

const FULL: MediaFeedCriteria = {
  sort: 'uses',
  q: 'croissant',
  tags: ['viennoiserie', 'packshot'],
  from: '2026-10-01',
  to: '2026-10-31',
  shotFrom: '2026-09-05',
  shotTo: '2026-09-11',
  untagged: true,
  unused: true,
  series: '01JSERIE',
};

describe("l'adresse de la médiathèque", () => {
  it('rend la même vue après un aller-retour', () => {
    expect(readCriteria(convertToParamMap(address(FULL)))).toEqual(FULL);
  });

  it('laisse l’adresse NUE pour la vue par défaut', () => {
    expect(address(ALL_MEDIA)).toEqual({});
  });

  it('retire une clé quand son critère revient au défaut', () => {
    expect(toQueryParams({ ...FULL, untagged: false, tags: [] })).toMatchObject({
      untagged: null,
      tags: null,
    });
  });

  it('n’emporte jamais le curseur', () => {
    expect(Object.keys(toQueryParams(FULL))).not.toContain('after');
  });

  it('lit un lien retouché sans vider la médiathèque', () => {
    const read = readCriteria(
      convertToParamMap({ sort: 'colour', from: '1/10/2026', untagged: 'oui', tags: ' a, ,a,b ' }),
    );
    expect(read).toEqual({ ...ALL_MEDIA, tags: ['a', 'b'] });
  });

  it('accepte `true` comme `1` pour un drapeau', () => {
    expect(readCriteria(convertToParamMap({ unused: 'true' })).unused).toBe(true);
  });

  it('ne compte pas le tri comme un filtre, et le garde en effaçant', () => {
    const sorted = { ...ALL_MEDIA, sort: 'name' as const };
    expect(isFiltering(sorted)).toBe(false);
    expect(isFiltering({ ...ALL_MEDIA, unused: true })).toBe(true);
    expect(withoutFilters(FULL)).toEqual({ ...ALL_MEDIA, sort: 'uses' });
  });

  it('compare les mots-clés dans l’ordre', () => {
    expect(sameCriteria(FULL, { ...FULL, tags: ['viennoiserie', 'packshot'] })).toBe(true);
    expect(sameCriteria(FULL, { ...FULL, tags: ['packshot', 'viennoiserie'] })).toBe(false);
  });

  it('pose le curseur sur la demande, et seulement s’il y en a un', () => {
    expect(toPageRequest(FULL, 60, null)).not.toHaveProperty('after');
    expect(toPageRequest(FULL, 60, 'c1')).toMatchObject({ after: 'c1', sort: 'uses', limit: 60 });
  });

  it('porte la série et le tri par prise de vue', () => {
    const view = { ...ALL_MEDIA, sort: 'shot' as const, series: 's1' };
    expect(address(view)).toEqual({ sort: 'shot', series: 's1' });
    expect(readCriteria(convertToParamMap({ sort: 'shot', series: ' s1 ' }))).toEqual(view);
  });

  it('compte la série comme un filtre, que « Tout afficher » défait', () => {
    const view = { ...ALL_MEDIA, sort: 'shot' as const, series: 's1' };
    expect(isFiltering(view)).toBe(true);
    expect(withoutFilters(view)).toEqual({ ...ALL_MEDIA, sort: 'shot' });
    expect(sameCriteria(view, { ...view, series: 's2' })).toBe(false);
  });

  it('envoie la série au serveur', () => {
    expect(toPageRequest({ ...ALL_MEDIA, series: 's1' }, 60, null)).toMatchObject({
      series: 's1',
    });
  });

  it('porte la période de prise de vue posée par la frise', () => {
    const view = { ...ALL_MEDIA, shotFrom: '2026-09-05', shotTo: '2026-09-11' };
    expect(address(view)).toEqual({ shotFrom: '2026-09-05', shotTo: '2026-09-11' });
    expect(readCriteria(convertToParamMap(address(view)))).toEqual(view);
    expect(readCriteria(convertToParamMap({ shotFrom: '5/9/2026' })).shotFrom).toBe('');
    expect(toPageRequest(view, 60, null)).toMatchObject({
      shotFrom: '2026-09-05',
      shotTo: '2026-09-11',
    });
  });

  it('compte la période de prise de vue comme un filtre, que « Tout afficher » défait', () => {
    const view = { ...ALL_MEDIA, shotFrom: '2026-09-05', shotTo: '2026-09-11' };
    expect(isFiltering(view)).toBe(true);
    expect(withoutFilters(view)).toEqual(ALL_MEDIA);
    expect(sameCriteria(view, { ...view, shotTo: '2026-09-12' })).toBe(false);
  });

  it('dit la période de prise de vue en toutes lettres, sans glisser de jour', () => {
    expect(shotRangeLabel({ ...ALL_MEDIA, shotFrom: '2026-09-05', shotTo: '2026-09-11' })).toBe(
      'Prises du 5 septembre 2026 au 11 septembre 2026',
    );
    expect(shotRangeLabel({ ...ALL_MEDIA, shotFrom: '2026-09-05', shotTo: '2026-09-05' })).toBe(
      'Prises le 5 septembre 2026',
    );
    expect(shotRangeLabel({ ...ALL_MEDIA, shotTo: '2026-09-05' })).toBe(
      "Prises jusqu'au 5 septembre 2026",
    );
    expect(shotRangeLabel(ALL_MEDIA)).toBeNull();
  });
});
