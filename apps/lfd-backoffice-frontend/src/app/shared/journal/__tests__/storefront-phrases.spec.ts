import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/**
 * **La phrase de la vitrine** (`storefront.saved`, plan
 * `documentation/commandes/boutique/boutique-rayon-layout.md`, D6) : la seule trace de
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

/**
 * **Les textes des e-mails** (`mail_copy.*`, `plan-textes-des-e-mails.md`,
 * C3, C6) : la publication compte comme celle de la boutique ; l'essai dit
 * quel e-mail, dans quelle langue, avec quels textes.
 */
function mailFact(type: string, subjectId: string, payload: Record<string, unknown>): FactInput {
  return {
    type,
    payload,
    subjectType: 'mail_copy',
    subjectId,
    actorName: 'Colette Martin',
    actorType: 'staff',
  };
}

describe('les textes des e-mails', () => {
  it('publiés : dit la version et compte les textes modifiés et rendus', () => {
    const rendered = renderFact(
      mailFact('mail_copy.published', 'mail', {
        subjectLabel: 'Textes des e-mails',
        version: 2,
        changes: [
          {
            mail: 'customer.order-placed',
            path: 'subject',
            locale: 'fr',
            before: null,
            after: 'Merci {ref}',
          },
          {
            mail: 'customer.order-placed',
            path: 'intro',
            locale: 'fr',
            before: 'Avant',
            after: null,
          },
        ],
      }),
    );

    expect(rendered.sentence).toBe(
      'Colette Martin a publié les textes des e-mails (version 2) : 1 texte modifié, 1 texte rendu à l’original',
    );
    expect(rendered.detail).toEqual([]);
  });

  it('un essai : l’e-mail, la langue et la source, sans détail restant', () => {
    const rendered = renderFact(
      mailFact('mail_copy.trial_sent', 'customer.order-placed', {
        subjectLabel: 'customer.order-placed',
        mail: 'customer.order-placed',
        locale: 'en',
        source: 'draft',
      }),
    );

    expect(rendered.sentence).toBe(
      'Colette Martin s’est envoyé un essai de l’e-mail customer.order-placed, en anglais, avec les brouillons',
    );
    expect(rendered.detail).toEqual([]);
  });
});
