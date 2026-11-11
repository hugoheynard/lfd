import { describe, expect, it } from 'vitest';

import { discountNames } from '../general-discount-lines';
import { discountLabel, discountPhrase } from '../general-discount-reading';
import { CATEGORIES, HUGO } from './general-discount-fixture';

/** **La remise générale dite en mots.** */

describe('la lecture', () => {
  const names = discountNames(CATEGORIES);

  it('dit la remise en une phrase', () => {
    expect(discountPhrase(HUGO, names)).toBe(
      '−30 % sur le reste du catalogue ; Pains −40 % ; Pains spéciaux −25 % ; Chocolat exclue ; Nom BAG (BAG) −35 %',
    );
    expect(discountLabel(3250)).toBe('−32,5 %');
  });
});
