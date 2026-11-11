import { describe, expect, it } from 'vitest';

import { amendmentBody } from '../amendment-body';
import { amendmentDiff, changeCount, editOf } from '../amendment-diff';
import { endAllowed, NO_END_REASON } from '../amendment-effect';
import { withEuros, withoutPrice } from '../draft-prices';
import { DATING, edited, STATE } from './amendment-fixture';

/**
 * **L'écart d'un avenant** (`l-avenant-date.md`, § 8.1) : chaque
 * ligne du tableau, la remise comparée par valeur, et l'avenant vide.
 */

describe('amendmentDiff', () => {
  it('pré-remplit la table avec l’état : rien ne change, et l’avenant est refusé', () => {
    const diff = amendmentDiff(STATE, editOf(STATE));
    expect(changeCount(diff)).toBe(0);
    expect(amendmentBody(diff, DATING)).toEqual({
      ok: false,
      refusal: 'L’avenant ne change rien.',
    });
  });

  it('article sans prix ferme → prix tapé : une ligne ouverte', () => {
    const diff = amendmentDiff(
      STATE,
      edited((edit) => ({ ...edit, firm: withEuros(edit.firm, 'BRI', 1.8) })),
    );
    expect(diff.lines).toEqual([{ sku: 'BRI', unitPriceMillicents: 180_000 }]);
    expect(diff.endedSkus).toEqual([]);
  });

  it('prix ferme → autre prix : arrêté ET rouvert dans le même avenant', () => {
    const diff = amendmentDiff(
      STATE,
      edited((edit) => ({ ...edit, firm: withEuros(edit.firm, 'CRO', 1.2) })),
    );
    expect(diff.endedSkus).toEqual(['CRO']);
    expect(diff.lines).toEqual([{ sku: 'CRO', unitPriceMillicents: 120_000 }]);
  });

  it('prix ferme → vidé : arrêté seulement', () => {
    const diff = amendmentDiff(
      STATE,
      edited((edit) => ({ ...edit, firm: withoutPrice(edit.firm, 'BAG') })),
    );
    expect(diff.endedSkus).toEqual(['BAG']);
    expect(diff.lines).toEqual([]);
  });

  it('une ligne à paliers ne se réécrit pas : elle se retire', () => {
    const diff = amendmentDiff(
      STATE,
      edited((edit) => ({ ...edit, removedTiered: new Set(['PAL']) })),
    );
    expect(diff.endedSkus).toEqual(['PAL']);
    expect(diff.firm.get('PAL')).toEqual({ kind: 'removed', before: null });
  });

  it('la remise se compare par valeur : mêmes lignes, autre objet, aucun changement', () => {
    const diff = amendmentDiff(
      STATE,
      edited((edit) => ({
        ...edit,
        discount: {
          mode: 'all_except',
          baseBp: 3000,
          lines: [{ target: 'category', targetId: 'choc', excluded: true, bp: null }],
        },
      })),
    );
    expect(diff.generalDiscount).toBeNull();
  });

  it('remise différente : `{ set: saisie }` ; retirée : `{ set: null }`', () => {
    const changed = amendmentDiff(
      STATE,
      edited((edit) => ({ ...edit, discount: { mode: 'all_except', baseBp: 3500, lines: [] } })),
    );
    expect(changed.generalDiscount).toEqual({
      set: { mode: 'all_except', baseBp: 3500, rules: [] },
    });
    const removed = amendmentDiff(
      STATE,
      edited((edit) => ({ ...edit, discount: null })),
    );
    expect(removed.generalDiscount).toEqual({ set: null });
  });

  it('une remise incomplète ne part pas, et le dit', () => {
    const diff = amendmentDiff(
      STATE,
      edited((edit) => ({ ...edit, discount: { mode: 'all_except', baseBp: null, lines: [] } })),
    );
    expect(diff.generalDiscount).toBeNull();
    expect(amendmentBody(diff, DATING)).toMatchObject({ ok: false });
  });

  it('politique différente : elle part, et interdit une fin (F1)', () => {
    const diff = amendmentDiff(
      STATE,
      edited((edit) => ({ ...edit, policy: { mode: 'all', promotionIds: [] } })),
    );
    expect(diff.promotionPolicy).toEqual({ mode: 'all', promotionIds: [] });
    expect(endAllowed(diff)).toBe(false);
    expect(amendmentBody(diff, { ...DATING, toDay: '2026-12-01' })).toEqual({
      ok: false,
      refusal: NO_END_REASON,
    });
  });
});
