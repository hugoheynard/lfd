import { describe, expect, it } from 'vitest';

import {
  NO_SERIES,
  chosenSeriesId,
  seriesDay,
  seriesLabel,
  seriesMonth,
  seriesOptions,
  seriesRefOf,
} from './series';

const CARTE = {
  id: 's1',
  title: 'Shooting carte 2026',
  shotOn: '2026-03-14',
  note: null,
  images: 12,
  createdAt: '2026-03-20T10:00:00.000Z',
};

describe('les séries', () => {
  it('se datent au mois sur une pastille, au jour dans une liste', () => {
    expect(seriesMonth('2026-03-14')).toBe('mars 2026');
    expect(seriesDay('2026-03-14')).toBe('14 mars 2026');
    expect(seriesMonth(null)).toBeNull();
    expect(seriesDay(null)).toBeNull();
  });

  it('se nomment par leur titre, et leur mois quand il est connu', () => {
    expect(seriesLabel(CARTE)).toBe('Shooting carte 2026 · mars 2026');
    expect(seriesLabel({ title: 'Sans date', shotOn: null })).toBe('Sans date');
  });

  it('donnent la référence qu’une image porte', () => {
    expect(seriesRefOf(CARTE)).toEqual({
      id: 's1',
      title: 'Shooting carte 2026',
      shotOn: '2026-03-14',
    });
    expect(seriesRefOf(null)).toBeNull();
    expect(seriesRefOf(undefined)).toBeNull();
  });

  it('se choisissent « Aucune série » en tête, et « Aucune » rend null', () => {
    expect(seriesOptions([CARTE])).toEqual([
      { value: NO_SERIES, label: 'Aucune série' },
      { value: 's1', label: 'Shooting carte 2026 · mars 2026' },
    ]);
    expect(chosenSeriesId(NO_SERIES)).toBeNull();
    expect(chosenSeriesId('s1')).toBe('s1');
  });
});
