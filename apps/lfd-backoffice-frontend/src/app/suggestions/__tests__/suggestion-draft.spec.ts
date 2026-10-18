import { describe, expect, it } from 'vitest';

import { staffSuggestion } from '../staff-suggestion.testing';
import {
  copyDraftOf,
  emptyDraft,
  MAX_SUGGESTED,
  missingOf,
  payloadOf,
  withoutSuggested,
  withSuggested,
  withTrigger,
} from '../suggestion-draft';

/** Les jours ne sont comparés à aucune horloge ici : le serveur juge la période. */
const DAY = '2026-10-18';

describe('le brouillon d’une suggestion', () => {
  it('garde l’emplacement d’un déclencheur qui le permet, sinon prend le premier possible', () => {
    const home = emptyDraft(DAY);
    expect(withTrigger(home, 'product_viewed').placement).toBe('product');
    expect(withTrigger({ ...home, placement: 'cart' }, 'product_in_cart').placement).toBe('cart');
    expect(withTrigger({ ...home, triggerRef: 'VIE-001' }, 'category_in_cart').triggerRef).toBe('');
  });

  it('ajoute un article sans doublon ni au-delà de la borne, et le retire', () => {
    let draft = emptyDraft(DAY);
    for (const sku of ['A', 'A', 'B', 'C', 'D']) {
      draft = withSuggested(draft, sku);
    }
    expect(draft.suggestedSkus).toEqual(['A', 'B', 'C']);
    expect(draft.suggestedSkus).toHaveLength(MAX_SUGGESTED);
    expect(withoutSuggested(draft, 'B').suggestedSkus).toEqual(['A', 'C']);
  });

  it('dit ce qui manque, dans l’ordre du formulaire', () => {
    const draft = emptyDraft(DAY);
    expect(missingOf(withTrigger(draft, 'category_in_cart'))).toBe(
      'Choisissez la famille qui déclenche.',
    );
    expect(missingOf(draft)).toBe('Choisissez au moins un article à montrer.');
    expect(missingOf({ ...withSuggested(draft, 'A'), priority: null })).toContain('priorité');
    expect(missingOf(withSuggested(draft, 'A'))).toBeNull();
  });

  it('envoie une phrase vide comme « aucune », et ne garde que les traductions écrites', () => {
    const draft = withSuggested(emptyDraft(DAY), 'A');
    expect(payloadOf(draft).phrase).toBeNull();
    expect(payloadOf({ ...draft, phraseFr: ' Le café ', phraseIt: 'Il caffè' }).phrase).toEqual({
      fr: 'Le café',
      it: 'Il caffè',
    });
    expect(payloadOf({ ...draft, triggerRef: 'VIE-001' }).trigger).toEqual({
      kind: 'everywhere',
      ref: null,
    });
  });

  describe('la copie (RS9)', () => {
    it('une règle finie garde sa durée et recommence ce jour-là', () => {
      const copy = copyDraftOf(
        staffSuggestion({ startsOn: '2025-12-20', endsOn: '2025-12-31', priority: 4 }),
        DAY,
      );
      expect(copy).toMatchObject({ startsOn: DAY, endsOn: '2026-10-29', priority: 4 });
      expect(copy.triggerRef).toBe('VIE-001');
      expect(copy.phraseFr).toBe('Avec un croissant, la baguette');
    });

    it('une règle à venir garde ses jours ; une période d’un jour reste d’un jour', () => {
      expect(
        copyDraftOf(staffSuggestion({ startsOn: '2026-12-01', endsOn: '2026-12-24' }), DAY),
      ).toMatchObject({ startsOn: '2026-12-01', endsOn: '2026-12-24' });
      expect(
        copyDraftOf(staffSuggestion({ startsOn: '2026-01-06', endsOn: '2026-01-06' }), DAY),
      ).toMatchObject({ startsOn: DAY, endsOn: DAY });
    });
  });
});
