import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/**
 * **La phrase de la vitrine** (`storefront.saved`, plan
 * `documentation/commandes/boutique-rayon-layout.md`, D6) : la seule trace de
 * qui a vidé un rayon — elle dit donc ce qui a bougé.
 */
function saved(payload: Record<string, unknown>): FactInput {
  return {
    type: 'storefront.saved',
    payload,
    subjectType: 'storefront',
    subjectId: 'main',
    actorName: 'Colette Martin',
    actorType: 'staff',
  };
}

describe('la vitrine enregistrée', () => {
  it('dit la version, ce qui a bougé en comptes, et combien de rayons', () => {
    const rendered = renderFact(
      saved({
        subjectLabel: 'Vitrine',
        revision: 4,
        added: ['o1'],
        moved: ['o2', 'o3'],
        archived: ['o4'],
        shelves: ['all', 'cat_choco'],
      }),
    );

    expect(rendered.sentence).toBe(
      'Colette Martin a enregistré la vitrine (version 4) : 1 objet ajouté, 2 objets déplacés, 1 objet retiré, sur 2 rayons',
    );
    expect(rendered.detail).toEqual([]);
  });

  it('ne cite pas un compte nul, et ne nomme jamais un rayon par son identifiant', () => {
    const { sentence } = renderFact(
      saved({
        subjectLabel: 'Vitrine',
        revision: 2,
        added: [],
        moved: [],
        archived: ['o4'],
        shelves: ['cat_choco'],
      }),
    );

    expect(sentence).toBe(
      'Colette Martin a enregistré la vitrine (version 2) : 1 objet retiré, sur 1 rayon',
    );
    expect(sentence).not.toContain('cat_choco');
  });

  it('dit un enregistrement qui ne change rien', () => {
    expect(
      renderFact(
        saved({
          subjectLabel: 'Vitrine',
          revision: 5,
          added: [],
          moved: [],
          archived: [],
          shelves: [],
        }),
      ).sentence,
    ).toBe('Colette Martin a enregistré la vitrine (version 5), sans rien y changer');
  });
});

/**
 * **Les textes de la boutique publiés** (`shop_copy.published`,
 * `plan-textes-de-la-boutique.md`, §10) : la phrase compte, la charge garde
 * chaque texte avant et après.
 */
function published(payload: Record<string, unknown>): FactInput {
  return {
    type: 'shop_copy.published',
    payload,
    subjectType: 'shop_copy',
    subjectId: 'shop',
    actorName: 'Colette Martin',
    actorType: 'staff',
  };
}

describe('les textes de la boutique publiés', () => {
  it('dit la version, les textes modifiés et ceux rendus à l’original', () => {
    const rendered = renderFact(
      published({
        subjectLabel: 'Textes de la boutique',
        version: 3,
        changes: [
          { key: 'cart.whoTitle', locale: 'fr', before: null, after: 'Pour qui ?' },
          { key: 'cart.whoTitle', locale: 'en', before: 'Who?', after: 'For whom?' },
          { key: 'cart.title', locale: 'fr', before: 'Mon panier', after: null },
        ],
      }),
    );

    expect(rendered.sentence).toBe(
      'Colette Martin a publié les textes de la boutique (version 3) : 2 textes modifiés, 1 texte rendu à l’original',
    );
    expect(rendered.detail).toEqual([]);
  });

  it('ne nomme jamais une clé de manifeste', () => {
    const { sentence } = renderFact(
      published({
        subjectLabel: 'Textes de la boutique',
        version: 1,
        changes: [{ key: 'cart.whoTitle', locale: 'fr', before: null, after: 'Pour qui ?' }],
      }),
    );
    expect(sentence).toBe(
      'Colette Martin a publié les textes de la boutique (version 1) : 1 texte modifié',
    );
    expect(sentence).not.toContain('cart.whoTitle');
  });

  it('dit une publication qui ne change rien à l’écran', () => {
    expect(
      renderFact(published({ subjectLabel: 'Textes de la boutique', version: 4, changes: [] }))
        .sentence,
    ).toBe(
      'Colette Martin a publié les textes de la boutique (version 4), sans rien changer à l’écran',
    );
  });
});
