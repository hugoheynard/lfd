import { describe, expect, it } from 'vitest';

import { foldCut, pinFirst, type ChipBox } from './tag-fold';

/** Des pastilles de 60 px, quatre par rangée de 280 px (écart 10). */
function rows(count: number): ChipBox[] {
  return Array.from({ length: count }, (_, index) => ({
    top: Math.floor(index / 4) * 30,
    left: (index % 4) * 70,
    width: 60,
  }));
}

describe('le repli de la bande', () => {
  it('ne coupe rien quand tout tient en deux rangées', () => {
    expect(foldCut({ boxes: rows(8), width: 280, reserve: 50, gap: 10 })).toBeNull();
  });

  it('coupe après la deuxième rangée, en rendant la place du bouton « + N autres »', () => {
    // La 8ᵉ pastille finit à 270 : le bouton (50) ne tient plus derrière elle.
    expect(foldCut({ boxes: rows(9), width: 280, reserve: 50, gap: 10 })).toBe(7);
  });

  it('garde la deuxième rangée entière quand le bouton y loge', () => {
    expect(foldCut({ boxes: rows(9), width: 400, reserve: 50, gap: 10 })).toBe(8);
  });

  it('garde au moins une pastille, même quand le bouton ne tient nulle part', () => {
    const tall = [0, 30, 60].map((top) => ({ top, left: 0, width: 280 }));
    expect(foldCut({ boxes: tall, width: 280, reserve: 50, gap: 10 })).toBe(1);
  });
});

describe('les mots épinglés', () => {
  const entries = ['a', 'b', 'c', 'd'].map((tag) => ({ tag }));

  it("met l'armé puis le filtre en tête, sans doublon, le reste dans son ordre", () => {
    expect(pinFirst(entries, ['d', 'c', 'd', 'absent']).map((entry) => entry.tag)).toEqual([
      'd',
      'c',
      'a',
      'b',
    ]);
  });
});
