import { describe, expect, it } from 'vitest';

import { amendmentDiff } from '../amendment-diff';
import { localAfter, rowLabel } from '../amendment-row-label';
import { withEuros, withoutPrice } from '../draft-prices';
import { article, edited, STATE } from './amendment-fixture';

/** **L'étiquette d'une ligne d'avenant** et le prix d'après calculé à l'écran. */

describe('rowLabel et localAfter', () => {
  it('nomme chaque changement', () => {
    const edit = edited((current) => ({
      ...current,
      firm: withEuros(withoutPrice(withEuros(current.firm, 'CRO', 1.2), 'BAG'), 'BRI', 1.8),
    }));
    const diff = amendmentDiff(STATE, edit);
    expect(rowLabel(article('CRO'), STATE, edit, diff)?.label).toBe('prix changé');
    expect(rowLabel(article('BRI'), STATE, edit, diff)?.label).toBe('prix ajouté');
    // Q1 : un prix retiré que la remise couvre la suit.
    expect(rowLabel(article('BAG'), STATE, edit, diff)?.label).toBe('suit la remise');
    expect(rowLabel(article('PAL'), STATE, edit, diff)).toEqual({
      label: 'à paliers',
      changed: false,
    });
    expect(rowLabel(article('CHO'), STATE, edit, diff)).toBeNull();
  });

  it('la remise qui change se dit sur les articles sans prix ferme', () => {
    const edit = edited((current) => ({
      ...current,
      discount: { mode: 'all_except', baseBp: 3500, lines: [] },
    }));
    const diff = amendmentDiff(STATE, edit);
    expect(rowLabel(article('CHO'), STATE, edit, diff)?.label).toBe('passe à −35 %');
    const stop = edited((current) => ({
      ...current,
      discount: null,
      firm: withoutPrice(current.firm, 'BAG'),
    }));
    const stopDiff = amendmentDiff(STATE, stop);
    expect(rowLabel(article('BRI'), STATE, stop, stopDiff)?.label).toBe('sort de la remise');
    expect(rowLabel(article('BAG'), STATE, stop, stopDiff)?.label).toBe('prix retiré');
  });

  it('calcule « Après » pour un prix de la mercuriale, relevé à la limite ; rien pour la chaîne', () => {
    const edit = edited((current) => ({ ...current, firm: withEuros(current.firm, 'CRO', 1) }));
    expect(localAfter(article('CRO'), edit, STATE.generalDiscount)).toEqual({
      millicents: 120_000,
      floored: true,
    });
    expect(localAfter(article('BRI'), edit, STATE.generalDiscount)).toEqual({
      millicents: 140_000,
      floored: false,
    });
    expect(localAfter(article('CHO'), edit, STATE.generalDiscount)).toBeNull();
  });
});
