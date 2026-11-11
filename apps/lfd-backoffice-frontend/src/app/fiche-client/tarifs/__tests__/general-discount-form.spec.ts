import { describe, expect, it } from 'vitest';

import {
  NEW_GENERAL_DISCOUNT,
  bpOfPercent,
  discountFormOf,
  discountPayload,
  discountProblem,
  sameDiscount,
  withDiscountLine,
  type GeneralDiscountForm,
} from '../general-discount-form';
import { HUGO } from './general-discount-fixture';

/** **La saisie de la remise générale** : ses refus, son corps, l'aller-retour avec la vue. */

describe('la saisie', () => {
  it('refuse un « tout sauf » sans taux de base, une ligne sans taux, un taux hors bornes', () => {
    expect(discountProblem(NEW_GENERAL_DISCOUNT)).toContain('taux de base');
    const form: GeneralDiscountForm = {
      mode: 'all_except',
      baseBp: 3000,
      lines: [{ target: 'category', targetId: 'pain', excluded: false, bp: null }],
    };
    expect(discountProblem(form)).toContain('pas de taux');
    expect(discountProblem({ ...form, baseBp: 10_000, lines: [] })).toContain('99,99');
  });

  it('refuse un « seulement » sans ligne à taux', () => {
    expect(
      discountProblem({
        mode: 'only',
        baseBp: null,
        lines: [{ target: 'category', targetId: 'choco', excluded: true, bp: null }],
      }),
    ).toContain('au moins une ligne');
  });

  it('écrit toujours le taux de base, `null` en « Seulement… », et `bp: null` pour une exclusion', () => {
    expect(
      discountPayload({
        mode: 'only',
        baseBp: 3000,
        lines: [
          { target: 'category', targetId: 'pain', excluded: false, bp: 4000 },
          { target: 'variant', targetId: 'BAG', excluded: true, bp: 1000 },
        ],
      }),
    ).toEqual({
      mode: 'only',
      baseBp: null,
      rules: [
        { target: 'category', targetId: 'pain', bp: 4000 },
        { target: 'variant', targetId: 'BAG', bp: null },
      ],
    });
  });

  it('relit la vue en saisie, aller-retour sans perte', () => {
    expect(discountPayload(discountFormOf(HUGO)!)).toEqual(HUGO);
    expect(discountFormOf(null)).toBeNull();
  });

  it('convertit les pourcents en points de base entiers', () => {
    expect(bpOfPercent(32.5)).toBe(3250);
    expect(bpOfPercent(0.07)).toBe(7);
    expect(bpOfPercent(null)).toBeNull();
  });

  it('n’ajoute pas deux fois la même cible ; une ligne neuve exclut en « tout sauf »', () => {
    const once = withDiscountLine(NEW_GENERAL_DISCOUNT, 'category', 'choco');
    expect(withDiscountLine(once, 'category', 'choco')).toBe(once);
    expect(once.lines[0]).toMatchObject({ excluded: true });
  });

  it('compare deux remises sans tenir compte de l’ordre des lignes', () => {
    expect(sameDiscount(HUGO, { ...HUGO, rules: [...HUGO.rules].reverse() })).toBe(true);
    expect(sameDiscount(HUGO, null)).toBe(false);
    expect(sameDiscount(null, null)).toBe(true);
  });
});
