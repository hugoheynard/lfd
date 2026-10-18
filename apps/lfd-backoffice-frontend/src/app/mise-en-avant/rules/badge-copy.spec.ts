import { describe, expect, it } from 'vitest';

import { adminView, entryView } from '../../textes-boutique/shop-copy.testing';
import { badgeCopyOf, BADGE_COPY_KEY } from './badge-copy';

describe('badgeCopyOf — le libellé lu dans Textes de la boutique', () => {
  it('rend l’original tant que rien n’est publié', () => {
    const copy = badgeCopyOf(adminView([entryView(BADGE_COPY_KEY, 'product', 'Incontournable')]));
    expect(copy).toEqual({
      texts: { fr: 'Incontournable', en: 'Incontournable', it: 'Incontournable' },
      pendingDraft: false,
    });
  });

  it('préfère le texte publié, et signale un brouillon en attente', () => {
    const copy = badgeCopyOf(
      adminView([
        entryView(BADGE_COPY_KEY, 'product', 'Incontournable', {
          locales: {
            fr: { publishedText: 'Coup de cœur' },
            en: { draftState: 'set', draftText: 'Favourite' },
          },
        }),
      ]),
    );
    expect(copy?.texts.fr).toBe('Coup de cœur');
    expect(copy?.texts.en).toBe('Incontournable');
    expect(copy?.pendingDraft).toBe(true);
  });

  it('rend `null` quand la clé manque', () => {
    expect(badgeCopyOf(adminView([]))).toBeNull();
  });
});
