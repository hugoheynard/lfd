import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/**
 * **Les phrases des comptes et des paniers** (plan des phrases du journal,
 * lot D, 2026-09-19) : chaque type sur sa forme courante, et sur ses formes
 * d'avant quand il en a — une ligne ancienne se lit sans « undefined » et sans
 * inventer de nom.
 */

const CAFE = 'Café des Halles';

function company(type: string, payload: Record<string, unknown>): FactInput {
  return {
    type,
    payload,
    subjectType: 'company',
    subjectId: 'co_1',
    actorName: 'Colette Martin',
    actorType: 'staff',
  };
}

function person(
  type: string,
  payload: Record<string, unknown>,
  actorName = 'Jean Dupont',
): FactInput {
  return {
    type,
    payload,
    subjectType: 'user',
    subjectId: 'usr_1',
    actorName,
    actorType: 'customer',
  };
}

function sentence(input: FactInput): string {
  return renderFact(input).sentence;
}

function labels(input: FactInput): string[] {
  return renderFact(input).detail.map((row) => row.label);
}

describe('la déclaration et l’activation d’un client', () => {
  it('dit qui a ouvert le compte, et son détenteur', () => {
    const staff = company('company.declared', {
      subjectLabel: CAFE,
      via: 'staff',
      owner: null,
    });
    const self = company('company.declared', {
      subjectLabel: CAFE,
      via: 'self',
      owner: { id: 'usr_1', name: 'Jean Dupont' },
    });

    expect(sentence(staff)).toBe(
      'Colette Martin a ouvert le compte du client « Café des Halles », sans détenteur',
    );
    expect(sentence(self)).toBe(
      'Colette Martin a déclaré sa société « Café des Halles », détenteur : Jean Dupont',
    );
    expect(renderFact(self).segments).toContainEqual({
      kind: 'subject',
      text: CAFE,
      route: '/comptes-clients/co_1',
    });
  });

  it('lit la forme d’avant le lot B, le détenteur par son seul identifiant', () => {
    const old = company('company.declared', { via: 'staff', ownerUserId: 'usr_9' });

    expect(sentence(old)).toBe(
      'Colette Martin a ouvert le compte d’un client, détenteur : une personne (identifiant usr_9)',
    );
    expect(renderFact(old).detail).toEqual([]);
  });

  it('nomme l’étape franchie, et tourne sans le nom sur une ligne ancienne', () => {
    expect(sentence(company('company.step_reached', { subjectLabel: CAFE, step: 'kbis' }))).toBe(
      'Colette Martin a franchi l’étape « KBIS » de l’activation du client « Café des Halles »',
    );
    expect(sentence(company('company.step_reached', { step: 'billing' }))).toBe(
      'Colette Martin a franchi l’étape « Facturation » de l’activation d’un client',
    );
  });

  it('laisse la date d’activation et de certification au détail', () => {
    const activated = company('company.activated', {
      subjectLabel: CAFE,
      activatedAt: '2026-09-19T08:00:00.000Z',
    });

    expect(sentence(activated)).toBe(
      'Colette Martin a activé le compte du client « Café des Halles »',
    );
    expect(labels(activated)).toEqual(['Activé le']);
    expect(sentence(company('company.kbis_certified', { at: '2026-09-19T08:00:00.000Z' }))).toBe(
      'Colette Martin a certifié l’extrait KBIS d’un client',
    );
  });

  it('dit qu’un KBIS retiré a coupé le compte — et laisse le « non » au détail', () => {
    const cut = company('company.kbis_revoked', {
      subjectLabel: CAFE,
      at: '2026-09-19T08:00:00.000Z',
      suspended: true,
    });
    const kept = company('company.kbis_revoked', {
      subjectLabel: CAFE,
      at: '2026-09-19T08:00:00.000Z',
      suspended: false,
    });

    expect(sentence(cut)).toBe(
      'Colette Martin a retiré la certification de l’extrait KBIS du client « Café des Halles », ce qui a suspendu son compte',
    );
    expect(labels(cut)).toEqual(['Le']);
    expect(labels(kept)).toEqual(['Le', 'Compte suspendu']);
  });

  it('nomme le fichier déposé, sous le nom d’aujourd’hui comme sous celui d’avant', () => {
    const expected =
      'Colette Martin a déposé l’extrait KBIS du client « Café des Halles » (kbis.pdf)';

    expect(
      sentence(company('company.kbis_uploaded', { subjectLabel: CAFE, fileName: 'kbis.pdf' })),
    ).toBe(expected);
    expect(sentence(company('company.kbis_uploaded_by_staff', { fileName: 'kbis.pdf' }))).toBe(
      'Colette Martin a déposé l’extrait KBIS d’un client (kbis.pdf)',
    );
  });
});

describe('l’identité et le règlement d’un client', () => {
  it('laisse les valeurs d’une identité corrigée au détail', () => {
    const corrected = company('company.identity_corrected', {
      subjectLabel: CAFE,
      raisonSociale: 'Café des Halles SARL',
      formeJuridique: 'SARL',
      siret: '12345678900011',
      siren: '123456789',
    });

    expect(sentence(corrected)).toBe(
      'Colette Martin a corrigé l’identité légale du client « Café des Halles »',
    );
    expect(labels(corrected)).toEqual(['Raison sociale', 'Forme juridique', 'SIRET', 'SIREN']);
  });

  it('nomme les champs modifiés — par leur mot, ou tels quels sur une ligne ancienne', () => {
    expect(
      sentence(
        company('company.identity_edited', { subjectLabel: CAFE, fields: ['enseigne', 'siret'] }),
      ),
    ).toBe('Colette Martin a modifié l’identité du client « Café des Halles » : enseigne, SIRET');
    expect(sentence(company('company.identity_edited', { fields: ['Enseigne commerciale'] }))).toBe(
      'Colette Martin a modifié l’identité d’un client : enseigne commerciale',
    );
  });

  it('dit les conditions accordées, et leur retrait', () => {
    expect(
      sentence(
        company('company.payment_terms_granted', { subjectLabel: CAFE, terms: ['monthly'] }),
      ),
    ).toBe(
      'Colette Martin a accordé au client « Café des Halles » les conditions de règlement : mensuel',
    );
    expect(sentence(company('company.payment_terms_granted', { terms: [] }))).toBe(
      'Colette Martin a retiré les conditions de règlement d’un client',
    );
  });

  it('dit la demande de délai du client, et son retrait', () => {
    expect(
      sentence(
        company('company.payment_term_requested', {
          subjectLabel: CAFE,
          before: null,
          after: 'monthly',
        }),
      ),
    ).toBe('Colette Martin a demandé un règlement mensuel pour le client « Café des Halles »');
    expect(
      sentence(
        company('company.payment_term_requested', {
          subjectLabel: CAFE,
          before: 'monthly',
          after: null,
        }),
      ),
    ).toBe('Colette Martin a retiré la demande de règlement mensuel du client « Café des Halles »');
  });

  it('dit le geste sur le statut du compte', () => {
    expect(
      sentence(company('company.status_changed', { subjectLabel: CAFE, action: 'suspend' })),
    ).toBe('Colette Martin a suspendu le compte du client « Café des Halles »');
    expect(sentence(company('company.status_changed', { action: 'terminate' }))).toBe(
      'Colette Martin a résilié le compte d’un client',
    );
  });
});

describe('les adresses d’un client', () => {
  it('dit l’adresse de facturation par sa ville', () => {
    expect(
      sentence(
        company('company.billing_address_saved', {
          subjectLabel: CAFE,
          ville: 'Paris',
          codePostal: '75011',
        }),
      ),
    ).toBe(
      'Colette Martin a enregistré l’adresse de facturation du client « Café des Halles », à Paris (75011)',
    );
  });

  it('cite l’adresse de livraison par son lieu, sur la forme courante comme sur l’ancienne', () => {
    const current = company('company.delivery_address_added', {
      subjectLabel: CAFE,
      address: { id: 'adr_1', ville: 'Paris', codePostal: '75011' },
    });
    const old = company('company.delivery_address_updated', {
      addressId: 'adr_1',
      ville: 'Lyon',
      codePostal: '69001',
    });

    expect(sentence(current)).toBe(
      'Colette Martin a ajouté l’adresse de livraison à Paris (75011) au client « Café des Halles »',
    );
    expect(renderFact(current).detail).toEqual([]);
    expect(sentence(old)).toBe(
      'Colette Martin a modifié l’adresse de livraison à Lyon (69001) d’un client',
    );
  });

  it('dit l’identifiant d’une adresse que la ligne ancienne ne situe pas', () => {
    expect(sentence(company('company.delivery_address_removed', { addressId: 'adr_1' }))).toBe(
      'Colette Martin a supprimé une adresse de livraison (identifiant adr_1) d’un client',
    );
    expect(
      sentence(
        company('company.default_delivery_set', {
          subjectLabel: CAFE,
          address: { id: 'adr_1', ville: 'Paris', codePostal: '75011' },
        }),
      ),
    ).toBe(
      'Colette Martin a fait de l’adresse de livraison à Paris (75011) du client « Café des Halles » l’adresse par défaut',
    );
  });

  it('dit le geste sur une procédure de livraison, jamais ce qui a été écrit', () => {
    const current = company('company.delivery_procedure_edited', {
      subjectLabel: CAFE,
      address: { id: 'adr_1', ville: 'Paris', codePostal: '75011' },
      action: 'step_added',
    });
    const retired = company('company.delivery_procedure_edited_by_staff', {
      companyId: 'co_1',
      addressId: 'adr_1',
      action: 'reordered',
    });

    expect(sentence(current)).toBe(
      'Colette Martin a modifié la procédure de livraison de l’adresse à Paris (75011) du client « Café des Halles » : étape ajoutée',
    );
    expect(sentence(retired)).toBe(
      'Colette Martin a modifié la procédure de livraison d’une adresse de livraison (identifiant adr_1) d’un client : étapes réordonnées',
    );
    expect(renderFact(retired).detail).toEqual([]);
  });

  it('dit le mode d’acheminement préféré, le lieu et la signature', () => {
    const delivery = company('company.fulfillment_preference_set', {
      subjectLabel: CAFE,
      method: 'delivery',
      pickupAddressId: null,
      deliveryAddress: { id: 'adr_1', ville: 'Paris', codePostal: '75011' },
      signatureRequired: true,
    });
    const pickup = company('company.fulfillment_preference_set', {
      method: 'pickup',
      pickupAddressId: 'pa_1',
      deliveryAddressId: null,
      signatureRequired: false,
    });
    const none = company('company.fulfillment_preference_set', {
      subjectLabel: CAFE,
      method: null,
      pickupAddressId: null,
      deliveryAddress: null,
      signatureRequired: false,
    });

    expect(sentence(delivery)).toBe(
      'Colette Martin a réglé le client « Café des Halles » en livraison par coursier par défaut, à Paris (75011), signature exigée',
    );
    expect(labels(delivery)).toEqual(['Point de retrait']);
    expect(sentence(pickup)).toBe(
      'Colette Martin a réglé un client en retrait au laboratoire par défaut',
    );
    expect(labels(pickup)).toEqual([
      'Point de retrait',
      'Adresse de livraison',
      'Signature exigée',
    ]);
    expect(sentence(none)).toBe(
      'Colette Martin a retiré le mode d’acheminement par défaut du client « Café des Halles »',
    );
  });
});

describe('les personnes d’un client', () => {
  it('nomme le contact et son rôle — ou son identifiant sur une ligne ancienne', () => {
    expect(
      sentence(
        company('company.contact_added', {
          subjectLabel: CAFE,
          contact: { id: 'cc_1', name: 'Jean Dupont' },
          role: 'admin',
        }),
      ),
    ).toBe(
      'Colette Martin a ajouté le contact Jean Dupont au client « Café des Halles », rôle : administrateur',
    );
    expect(
      sentence(company('company.contact_updated', { contactId: 'cc_1', role: 'Gérant' })),
    ).toBe('Colette Martin a modifié un contact (identifiant cc_1) d’un client, rôle : gérant');
    expect(
      sentence(company('company.contact_removed', { subjectLabel: CAFE, contact: { id: 'cc_1' } })),
    ).toBe('Colette Martin a retiré un contact (identifiant cc_1) du client « Café des Halles »');
  });

  it('dit le changement d’interlocuteur principal', () => {
    expect(sentence(company('company.primary_contact_changed', { subjectLabel: CAFE }))).toBe(
      'Colette Martin a changé l’interlocuteur principal du client « Café des Halles »',
    );
  });

  it('dit l’accès ouvert, à qui, et avec quel rôle', () => {
    expect(
      sentence(
        company('company.access_opened', {
          subjectLabel: CAFE,
          person: { id: 'usr_1', name: 'Jean Dupont' },
          role: 'owner',
        }),
      ),
    ).toBe(
      'Colette Martin a ouvert à Jean Dupont un accès à l’espace du client « Café des Halles », rôle : détenteur du compte',
    );
    expect(sentence(company('company.access_opened', { userId: 'usr_1', role: 'orders' }))).toBe(
      'Colette Martin a ouvert à une personne (identifiant usr_1) un accès à l’espace d’un client, rôle : commandes',
    );
  });

  it('dit un RIB par sa fin et son titulaire, jamais l’IBAN', () => {
    const first = company('company.bank_account_changed', {
      subjectLabel: CAFE,
      bankAccountId: 'cba_1',
      before: null,
      after: { last4: '1234', holder: 'Café des Halles SARL' },
      via: 'customer',
    });
    const replaced = company('company.bank_account_changed', {
      bankAccountId: 'cba_2',
      before: { last4: '1234', holder: 'A' },
      after: { last4: '5678', holder: 'B' },
      via: 'staff',
    });

    expect(sentence(first)).toBe(
      'Colette Martin a déposé le RIB du client « Café des Halles » : …1234 (Café des Halles SARL)',
    );
    expect(labels(first)).toEqual(['RIB']);
    expect(sentence(replaced)).toBe(
      'Colette Martin a changé le RIB d’un client de …1234 (A) à …5678 (B)',
    );
  });
});

describe('les notes du commercial', () => {
  it.each([
    ['note_added', 'note ajoutée'],
    ['note_revised', 'note modifiée'],
    ['note_removed', 'note supprimée définitivement'],
    ['notes_reordered', 'notes reclassées'],
  ])('dit le geste « %s » par le dictionnaire des valeurs', (action, said) => {
    expect(
      sentence(company('company.client_note_edited_by_staff', { subjectLabel: CAFE, action })),
    ).toBe(
      `Colette Martin a modifié les notes du commercial du client « Café des Halles » : ${said}`,
    );
  });

  it('lit la forme d’avant, et ne dit jamais le contenu d’une note', () => {
    const old = renderFact(
      company('company.client_note_edited_by_staff', {
        companyId: 'co_1',
        noteId: 'note_1',
        action: 'note_added',
      }),
    );
    const outOfSchema = renderFact(
      company('company.client_note_edited_by_staff', {
        action: 'note_added',
        title: 'Rendez-vous secret',
        body: 'Remise de 30 %',
      }),
    );

    expect(old.sentence).toBe(
      'Colette Martin a modifié les notes du commercial d’un client : note ajoutée',
    );
    expect(old.detail).toEqual([{ label: 'Note', value: '(identifiant note_1)' }]);
    expect(outOfSchema.sentence).not.toContain('secret');
    expect(outOfSchema.detail).toEqual([]);
  });
});

describe('la personne', () => {
  it('ne répète pas le nom de la personne qui agit sur son propre compte', () => {
    expect(sentence(person('user.registered', { subjectLabel: 'Jean Dupont' }))).toBe(
      'Jean Dupont a créé son compte',
    );
    expect(sentence(person('user.registered', {}, ''))).toBe('Un client a créé son compte');
  });

  it('garde l’adresse d’une inscription ancienne au détail, hors de la phrase', () => {
    const old = renderFact(person('user.registered', { email: 'jean@exemple.fr' }, ''));

    expect(old.sentence).toBe('Un client a créé son compte');
    expect(old.detail).toEqual([{ label: 'Adresse e-mail', value: 'jean@exemple.fr' }]);
  });

  it('nomme les champs d’un profil, jamais leurs valeurs', () => {
    expect(
      sentence(
        person('user.profile_updated', {
          subjectLabel: 'Jean Dupont',
          fields: ['firstName', 'phone'],
        }),
      ),
    ).toBe('Jean Dupont a modifié son profil : prénom, téléphone');
    expect(sentence(person('user.profile_updated', { fields: ['email'] }, ''))).toBe(
      'Un client a modifié son profil : adresse e-mail',
    );
  });

  it('dit pour qui l’équipe a fabriqué un lien de mot de passe', () => {
    const staff = (payload: Record<string, unknown>): FactInput => ({
      ...person('user.password_link_issued', payload),
      actorName: 'Colette Martin',
      actorType: 'staff',
    });

    expect(sentence(staff({ subjectLabel: 'Jean Dupont' }))).toBe(
      'Colette Martin a fabriqué un lien de mot de passe pour Jean Dupont, à lui remettre en personne',
    );
    expect(sentence(staff({}))).toBe(
      'Colette Martin a fabriqué un lien de mot de passe pour une personne, à lui remettre en personne',
    );
  });
});

describe('les paniers récurrents', () => {
  it('dit le rythme d’un panier ouvert', () => {
    expect(
      sentence(
        person('subscription.created', {
          subjectLabel: 'Jean Dupont',
          subscriptionId: 'sub_1',
          recurrence: 'weekly',
        }),
      ),
    ).toBe('Jean Dupont a ouvert un panier récurrent (chaque semaine)');
    expect(
      sentence(person('subscription.created', { subscriptionId: 'sub_1', recurrence: 'monthly' })),
    ).toBe('Jean Dupont a ouvert un panier récurrent (chaque mois)');
  });

  it('dit la pause et la reprise', () => {
    expect(
      sentence(person('subscription.status_changed', { before: 'active', after: 'paused' })),
    ).toBe('Jean Dupont a mis en pause un panier récurrent');
    expect(
      sentence(person('subscription.status_changed', { before: 'paused', after: 'active' })),
    ).toBe('Jean Dupont a réactivé un panier récurrent');
  });

  it('dit l’échéance sautée ou modifiée ; les lignes restent au détail', () => {
    const skipped = renderFact(
      person('subscription.occurrence_overridden', {
        date: '2026-09-19',
        before: null,
        after: { skipped: true, lines: [] },
      }),
    );
    const changed = renderFact(
      person('subscription.occurrence_overridden', {
        date: '2026-09-19',
        before: null,
        after: { skipped: false, lines: [{ sku: 'TAR-001', quantity: 3 }] },
      }),
    );

    expect(skipped.sentence).toBe(
      'Jean Dupont a sauté l’échéance du 19 septembre 2026 d’un panier récurrent',
    );
    expect(skipped.detail.map((row) => row.label)).toEqual(['Avant']);
    expect(changed.sentence).toBe(
      'Jean Dupont a modifié l’échéance du 19 septembre 2026 d’un panier récurrent',
    );
    expect(changed.detail.map((row) => row.label)).toContain('Après › Lignes');
  });

  it('dit le rythme et le mode d’un panier supprimé, le reste au détail', () => {
    expect(
      sentence(
        person('subscription.deleted', {
          recurrence: 'biweekly',
          status: 'active',
          startDate: '2026-09-01',
          endDate: null,
          fulfillmentMethod: 'pickup',
          pickupAddressId: 'pa_1',
          lines: [],
        }),
      ),
    ).toBe(
      'Jean Dupont a supprimé un panier récurrent (toutes les 2 semaines, retrait au laboratoire)',
    );
  });
});

describe('les demandes de contact', () => {
  it('dit le canal et pour qui', () => {
    expect(
      sentence(
        company('support.requested', {
          subjectLabel: CAFE,
          supportRequestId: 'sr_1',
          channel: 'phone',
        }),
      ),
    ).toBe(
      'Colette Martin a déposé une demande de contact par téléphone, pour le client « Café des Halles »',
    );
    expect(
      sentence(person('support.requested', { supportRequestId: 'sr_1', channel: 'email' })),
    ).toBe('Jean Dupont a déposé une demande de contact par e-mail');
  });

  it('dit qui a traité la demande', () => {
    expect(
      sentence(company('support.handled', { subjectLabel: CAFE, supportRequestId: 'sr_1' })),
    ).toBe('Colette Martin a traité une demande de contact, pour le client « Café des Halles »');
  });
});

describe('l’accès aux fonctionnalités', () => {
  function feature(type: string, payload: Record<string, unknown>): FactInput {
    return { ...company(type, payload), subjectType: 'feature_access', subjectId: 'shop' };
  }

  it('dit le niveau d’avant et le nouveau, par leur mot', () => {
    expect(
      sentence(
        feature('feature_access.override_set', {
          subjectLabel: 'Boutique',
          value: 'closed',
          previousValue: 'order',
        }),
      ),
    ).toBe('Colette Martin a passé « Boutique » de Commander à Fermée');
    expect(
      sentence(
        feature('feature_access.override_set', {
          subjectLabel: 'Boutique',
          value: 'browse',
          previousValue: null,
        }),
      ),
    ).toBe('Colette Martin a passé « Boutique » à Voir, à la place du réglage par défaut');
  });

  it('dit le retour au défaut, et ce qui s’appliquait', () => {
    expect(
      sentence(
        feature('feature_access.override_cleared', {
          subjectLabel: 'Boutique',
          previousValue: 'closed',
        }),
      ),
    ).toBe('Colette Martin a rendu « Boutique » à son réglage par défaut (c’était Fermée)');
    expect(sentence(feature('feature_access.override_cleared', { previousValue: 'closed' }))).toBe(
      'Colette Martin a rendu une fonctionnalité (identifiant shop) à son réglage par défaut (c’était Fermée)',
    );
  });

  it('dit l’exemption ouverte ou retirée, et laisse l’adresse au détail telle quelle', () => {
    const added = renderFact(
      feature('feature_access.exemption_added', {
        subjectLabel: 'Boutique',
        exemptionId: 'fx_1',
        email: 'testeur@exemple.fr',
      }),
    );
    const removed = renderFact(
      feature('feature_access.exemption_removed', {
        exemptionId: 'fx_1',
        email: 'testeur@exemple.fr',
      }),
    );

    expect(added.sentence).toBe('Colette Martin a ouvert « Boutique » à une adresse exemptée');
    expect(added.sentence).not.toContain('testeur');
    expect(added.detail).toContainEqual({ label: 'Adresse e-mail', value: 'testeur@exemple.fr' });
    expect(removed.sentence).toBe(
      'Colette Martin a retiré l’exemption d’une adresse sur une fonctionnalité (identifiant shop)',
    );
  });
});
