import { describe, expect, it } from 'vitest';

import { columnAt, stripSummary } from './palette-strip-layout';

describe('la frise, en colonnes et en mots', () => {
  it('trouve la colonne sous le pointeur, bornée aux deux bouts', () => {
    expect(columnAt(0, 300, 3)).toBe(0);
    expect(columnAt(150, 300, 3)).toBe(1);
    expect(columnAt(400, 300, 3)).toBe(2);
    expect(columnAt(-5, 300, 3)).toBe(0);
  });

  it('ne désigne rien sur une frise vide ou sans largeur', () => {
    expect(columnAt(10, 300, 0)).toBeNull();
    expect(columnAt(10, 0, 3)).toBeNull();
  });

  it('dit le total, et ce qui reste sans couleurs', () => {
    expect(stripSummary(null)).toBe('');
    expect(stripSummary({ columns: [], total: 1, unpainted: 0 })).toBe('1 photo');
    expect(stripSummary({ columns: [], total: 12, unpainted: 3 })).toBe(
      '12 photos, dont 3 sans couleurs encore',
    );
  });
});
