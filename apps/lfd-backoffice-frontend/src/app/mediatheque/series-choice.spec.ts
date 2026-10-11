import type { MediaSeriesView } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import { SeriesChoice } from './series-choice';

const SERIES: readonly MediaSeriesView[] = [
  {
    id: 's1',
    title: 'Automne',
    shotOn: '2026-09-01',
    note: null,
    images: 3,
    createdAt: '2026-09-02T08:00:00.000Z',
  },
  {
    id: 's2',
    title: 'Hiver',
    shotOn: null,
    note: null,
    images: 0,
    createdAt: '2026-09-02T08:00:00.000Z',
  },
];

describe('le choix de la série d’une image', () => {
  it('rattache, puis détache par « Aucune série », liste refermée', () => {
    const choice = new SeriesChoice(() => () => SERIES);
    choice.changing.set(true);
    choice.choose('s1');
    expect(choice.current()).toEqual({ id: 's1', title: 'Automne', shotOn: '2026-09-01' });
    expect(choice.changing()).toBe(false);
    choice.choose('');
    expect(choice.current()).toBeNull();
  });

  it('propose « Aucune série » d’abord, et se lit seulement sans liste', () => {
    expect(new SeriesChoice(() => () => SERIES).options().map((option) => option.label)).toEqual([
      'Aucune série',
      'Automne · septembre 2026',
      'Hiver',
    ]);
    expect(new SeriesChoice(() => undefined).canChange()).toBe(false);
  });
});
