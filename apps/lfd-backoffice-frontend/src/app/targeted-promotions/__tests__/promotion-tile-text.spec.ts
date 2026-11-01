import { describe, expect, it } from 'vitest';

import { draftOf, duplicateDraft, emptyDraft, termsOf } from '../promotion-draft';
import { NO_TILE_TEXT, tileTextPayloadOf, tileTextPreview } from '../promotion-tile-text';
import { promotionView } from '../promotion.testing';

const TODAY = '2026-11-01';
const COFFEE = { fr: '−20 % client Folie Coffee', en: '−20% Folie Coffee', it: null };

describe('le texte sur les vignettes, côté écran', () => {
  it('rien de saisi part à null ; le texte est rogné, une traduction vide vaut null', () => {
    expect(tileTextPayloadOf(NO_TILE_TEXT)).toBeNull();
    expect(tileTextPayloadOf({ fr: '  −20 %  ', en: ' ', it: 'x' })).toEqual({
      fr: '−20 %',
      en: null,
      it: 'x',
    });
  });

  it('une traduction sans français part telle quelle : le serveur la refuse en la nommant', () => {
    expect(tileTextPayloadOf({ fr: '', en: '−20%', it: '' })).toEqual({
      fr: '',
      en: '−20%',
      it: null,
    });
  });

  it('l’aperçu dit le texte, sinon la valeur seule', () => {
    expect(
      tileTextPreview({ ...NO_TILE_TEXT, fr: ' Folie ' }, { kind: 'percent_off', value: 20 }),
    ).toBe('Folie');
    expect(tileTextPreview(NO_TILE_TEXT, { kind: 'percent_off', value: 12.5 })).toBe('−12,5 %');
    expect(tileTextPreview(NO_TILE_TEXT, { kind: 'basket_amount_off', value: 5 })).toBe('−5,00 €');
    expect(tileTextPreview(NO_TILE_TEXT, { kind: 'percent_off', value: null })).toBeNull();
  });

  it('relu, dupliqué, et envoyé au panier seulement', () => {
    const view = promotionView({ tileText: COFFEE });
    expect(draftOf(view).tileText).toEqual({ fr: COFFEE.fr, en: COFFEE.en, it: '' });
    expect(duplicateDraft(view).tileText.fr).toBe(COFFEE.fr);

    const atLine = { ...emptyDraft(TODAY, null), tileText: { fr: 'x', en: '', it: '' } };
    expect(termsOf(atLine).tileText).toBeNull();
    const basket = { ...emptyDraft(TODAY, 'pk_1'), tileText: { fr: 'x', en: '', it: '' } };
    expect(termsOf(basket).tileText).toEqual({ fr: 'x', en: null, it: null });
  });
});
