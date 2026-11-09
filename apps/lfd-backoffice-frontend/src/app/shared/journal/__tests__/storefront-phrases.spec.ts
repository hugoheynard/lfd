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

describe('la place des allergènes en boutique (2026-10-27)', () => {
  it('dit la nouvelle place, puis celle d’avant', () => {
    const rendered = renderFact({
      type: 'storefront.allergen_display_changed',
      payload: { subjectLabel: 'Vitrine', from: 'sheet', to: 'gallery' },
      subjectType: 'storefront',
      subjectId: 'main',
      actorName: 'Colette Martin',
      actorType: 'staff',
    });

    expect(rendered.sentence).toBe(
      'Colette Martin a réglé les allergènes de la boutique : Aussi dans la galerie (avant : Sur la fiche ouverte seulement)',
    );
    expect(rendered.detail).toEqual([]);
  });
});

/** **La charte d'un espace d'e-mails** (`mail_copy.charter_*`, plan-editeur-par-blocs.md § 25, C2). */
describe('la charte d’un espace d’e-mails', () => {
  it('le brouillon : nomme l’espace, sans détail restant', () => {
    const rendered = renderFact({
      ...mailFact('mail_copy.charter_saved', 'lfd', {
        subjectLabel: 'La Folie Douce — équipe',
        space: 'lfd',
        revision: 3,
      }),
      subjectType: 'mail_charter',
    });

    expect(rendered.sentence).toBe(
      'Colette Martin a enregistré le brouillon de la charte de l’espace La Folie Douce — équipe',
    );
    expect(rendered.detail).toEqual([]);
  });

  it('la publication : l’espace et la version', () => {
    const rendered = renderFact({
      ...mailFact('mail_copy.charter_published', 'lfc', {
        subjectLabel: 'La Folie Coffee — clients',
        space: 'lfc',
        version: 2,
        previousVersion: 1,
        publicationVersion: 9,
      }),
      subjectType: 'mail_charter',
    });

    expect(rendered.sentence).toBe(
      'Colette Martin a publié la charte de l’espace La Folie Coffee — clients (version 2)',
    );
    expect(rendered.detail).toEqual([]);
  });
});

/** **L'expéditeur d'un espace** (`mail_copy.sender_changed`, plan-editeur-par-blocs.md § 25, C3). */
describe('l’expéditeur d’un espace d’e-mails', () => {
  it('nomme l’espace, le nom d’expéditeur et le domaine, sans détail restant', () => {
    const rendered = renderFact({
      ...mailFact('mail_copy.sender_changed', 'lfd', {
        subjectLabel: 'La Folie Douce — équipe',
        space: 'lfd',
        revision: 1,
        senderName: 'La Folie Douce',
        fromDomain: 'lfd-backoffice.com',
        publicationVersion: 12,
      }),
      subjectType: 'mail_sender',
    });

    expect(rendered.sentence).toBe(
      'Colette Martin a changé l’expéditeur de l’espace La Folie Douce — équipe : La Folie Douce, sur le domaine lfd-backoffice.com',
    );
    expect(rendered.detail).toEqual([]);
  });
});

/** **Une adresse révélée** (`mail.recipient_revealed`, le-suivi-des-e-mails.md, décision 7). */
describe('l’adresse d’un envoi révélée', () => {
  it('nomme l’e-mail, jamais l’adresse, sans détail restant', () => {
    const rendered = renderFact({
      ...mailFact('mail.recipient_revealed', 'send_1', {
        subjectLabel: 'customer.order-ready',
        mail: 'customer.order-ready',
        space: 'lfc',
      }),
      subjectType: 'mail_send',
    });

    expect(rendered.sentence).toBe(
      'Colette Martin a affiché l’adresse du destinataire d’un envoi de l’e-mail customer.order-ready',
    );
    expect(rendered.detail).toEqual([]);
  });
});

/** **Une recherche par adresse** (`mail.recipient_searched`, le-suivi-des-e-mails.md, décision 8). */
describe('la recherche des envois d’une adresse', () => {
  it('compte les envois trouvés, sans adresse, sans détail restant', () => {
    const rendered = renderFact({
      ...mailFact('mail.recipient_searched', 'srch_1', { found: 2 }),
      subjectType: 'mail_recipient_search',
    });

    expect(rendered.sentence).toBe(
      'Colette Martin a cherché les envois d’une adresse : 2 envois trouvés',
    );
    expect(rendered.detail).toEqual([]);
  });

  it('dit quand rien n’a été trouvé', () => {
    const rendered = renderFact(mailFact('mail.recipient_searched', 'srch_1', { found: 0 }));
    expect(rendered.sentence).toBe(
      'Colette Martin a cherché les envois d’une adresse : aucun envoi trouvé',
    );
  });
});

/** **Le registre vu par le staff** (la-desinscription-et-l-accord.md, C4). */
describe('les désinscriptions et accords', () => {
  it('une adresse affichée nomme l’espace, jamais l’adresse', () => {
    const rendered = renderFact({
      ...mailFact('mail.preference_recipient_revealed', 'pref_1', { space: 'lfc' }),
      subjectType: 'mail_marketing_preference',
    });

    expect(rendered.sentence).toBe(
      'Colette Martin a affiché l’adresse d’une ligne des désinscriptions et accords de l’espace lfc',
    );
    expect(rendered.detail).toEqual([]);
  });

  it('une désinscription par le staff dit si elle a changé quelque chose', () => {
    const changed = renderFact({
      ...mailFact('mail.marketing_unsubscribed_by_staff', 'pref_1', {
        space: 'lfc',
        changed: true,
      }),
      subjectType: 'mail_marketing_preference',
    });
    const already = renderFact({
      ...mailFact('mail.marketing_unsubscribed_by_staff', 'pref_1', {
        space: 'lfc',
        changed: false,
      }),
      subjectType: 'mail_marketing_preference',
    });

    expect(changed.sentence).toBe(
      'Colette Martin a désinscrit une adresse des e-mails marketing de l’espace lfc, à la demande du client',
    );
    expect(already.sentence).toContain('(elle l’était déjà)');
    expect(changed.detail).toEqual([]);
  });

  it('une recherche par adresse compte les lignes trouvées, sans adresse', () => {
    const rendered = renderFact({
      ...mailFact('mail.preference_recipient_searched', 'srch_1', { found: 1 }),
      subjectType: 'mail_preference_search',
    });

    expect(rendered.sentence).toBe(
      'Colette Martin a cherché une adresse dans les désinscriptions et accords : 1 ligne trouvée',
    );
    expect(rendered.detail).toEqual([]);
  });
});
