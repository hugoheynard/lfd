import { describe, expect, it } from 'vitest';

import { articleCount, discountSummary, firmSummary } from '../posed-summary';

const NAMES = new Map([
  ['bag', 'Baguettes & flûtes'],
  ['choc', 'Chocolat'],
  ['sale', 'Salé & traiteur'],
]);

describe('le résumé d’une mercuriale posée', () => {
  it('compte les prix fermes, « Aucun » à zéro', () => {
    expect(articleCount(0)).toBe('Aucun');
    expect(articleCount(1)).toBe('1 article');
    expect(articleCount(12)).toBe('12 articles');
  });

  it('dit l’écart moyen quand il se calcule, et le tait sinon', () => {
    expect(firmSummary(2, [1000, 2000, null])).toEqual({
      value: '2 articles',
      detail: 'Écart moyen au catalogue : −15,0 %',
    });
    expect(firmSummary(0, [])).toEqual({ value: 'Aucun', detail: null });
    expect(firmSummary(1, [null]).detail).toBeNull();
  });

  it('lit la remise : le taux de base, puis les taux particuliers, puis les exclusions', () => {
    const summary = discountSummary(
      {
        mode: 'all_except',
        baseBp: 1000,
        rules: [
          { target: 'category', targetId: 'choc', bp: null },
          { target: 'category', targetId: 'bag', bp: 5000 },
          { target: 'category', targetId: 'sale', bp: 1500 },
        ],
      },
      NAMES,
    );
    expect(summary?.rate).toBe('−10 %');
    expect(summary?.scope).toBe('sur le reste du catalogue');
    expect(summary?.lines.map((line) => [line.name, line.value, line.excluded])).toEqual([
      ['Baguettes & flûtes', '−50 %', false],
      ['Salé & traiteur', '−15 %', false],
      ['Chocolat', 'exclue', true],
    ]);
  });

  it('dit « tout le catalogue » sans ligne, « seulement » sans taux de base, rien sans remise', () => {
    expect(discountSummary({ mode: 'all_except', baseBp: 1000, rules: [] }, NAMES)?.scope).toBe(
      'sur tout le catalogue',
    );
    const only = discountSummary(
      { mode: 'only', baseBp: null, rules: [{ target: 'category', targetId: 'bag', bp: 4000 }] },
      NAMES,
    );
    expect(only?.rate).toBeNull();
    expect(only?.scope).toBe('Seulement sur :');
    expect(discountSummary(null, NAMES)).toBeNull();
  });
});
