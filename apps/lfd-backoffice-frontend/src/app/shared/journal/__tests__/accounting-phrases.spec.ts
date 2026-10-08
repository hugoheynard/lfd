import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/**
 * **Les phrases de la comptabilité** (plan des phrases du journal, lot D,
 * 2026-09-19) : l'entité émettrice et les mandats SEPA — forme courante, et
 * forme d'avant le lot B, qui ne cite la société que par son identifiant.
 */

const ENTITY = 'La Folie Douce SAS';
const CAFE = { id: 'co_1', name: 'Café des Halles' };

function entity(type: string, payload: Record<string, unknown>): FactInput {
  return {
    type,
    payload,
    subjectType: 'legal_entity',
    subjectId: 'le_1',
    actorName: 'Colette Martin',
    actorType: 'staff',
  };
}

function mandate(type: string, payload: Record<string, unknown>): FactInput {
  return { ...entity(type, payload), subjectType: 'payment_mandate', subjectId: 'pm_1' };
}

function sentence(input: FactInput): string {
  return renderFact(input).sentence;
}

describe('l’entité émettrice', () => {
  it('dit la déclaration et son SIREN, liée à la fiche', () => {
    const declared = renderFact(
      entity('legal_entity.declared', { subjectLabel: ENTITY, name: ENTITY, siren: '123456789' }),
    );

    expect(declared.sentence).toBe(
      'Colette Martin a déclaré l’entité émettrice « La Folie Douce SAS » (SIREN 123456789)',
    );
    expect(declared.segments).toContainEqual({
      kind: 'subject',
      text: ENTITY,
      route: '/comptabilite/entites-juridiques/le_1',
    });
    expect(declared.detail).toEqual([]);
  });

  it('lit une ligne d’avant le lot B par le nom qu’elle porte, ou sans nom', () => {
    expect(sentence(entity('legal_entity.corrected', { name: ENTITY }))).toBe(
      'Colette Martin a corrigé l’identité de l’entité émettrice « La Folie Douce SAS »',
    );
    expect(sentence(entity('legal_entity.archived', {}))).toBe(
      'Colette Martin a archivé une entité émettrice',
    );
    expect(sentence(entity('legal_entity.pre_notification_changed', { days: 14 }))).toBe(
      'Colette Martin a fixé le préavis de prélèvement d’une entité émettrice à 14 jours',
    );
  });

  it('dit le calendrier de prélèvement, et le cut-off à renseigner tel quel', () => {
    expect(
      sentence(
        entity('legal_entity.collection_schedule_changed', {
          subjectLabel: ENTITY,
          delayHours: 2,
          daysAfterClosure: 20,
          depositCutoffBusinessDays: 2,
          depositCutoffTime: '16:00',
        }),
      ),
    ).toBe(
      'Colette Martin a réglé le calendrier de prélèvement de l’entité émettrice « La Folie Douce SAS » : échéance à la clôture + 20 jours, constitution 2 h après la clôture, dépôt au plus tard 2 jours ouvrés avant, à 16:00',
    );
    expect(
      sentence(
        entity('legal_entity.collection_schedule_changed', {
          subjectLabel: ENTITY,
          delayHours: 1,
          daysAfterClosure: null,
          depositCutoffBusinessDays: null,
          depositCutoffTime: null,
        }),
      ),
    ).toBe(
      'Colette Martin a réglé le calendrier de prélèvement de l’entité émettrice « La Folie Douce SAS » : échéance au terme du préavis, constitution 1 h après la clôture, dépôt limite à renseigner',
    );
  });

  it('dit l’activation et la désactivation du prélèvement automatique', () => {
    expect(sentence(entity('legal_entity.auto_collection_enabled', { subjectLabel: ENTITY }))).toBe(
      'Colette Martin a activé le prélèvement automatique de l’entité émettrice « La Folie Douce SAS »',
    );
    expect(
      sentence(entity('legal_entity.auto_collection_disabled', { subjectLabel: ENTITY })),
    ).toBe(
      'Colette Martin a désactivé le prélèvement automatique de l’entité émettrice « La Folie Douce SAS »',
    );
  });

  it('dit les mentions de paiement de la facture, et « à renseigner » tel quel', () => {
    expect(
      sentence(
        entity('legal_entity.invoice_payment_terms_changed', {
          subjectLabel: ENTITY,
          latePenaltyRateBasisPoints: 1415,
          recoveryIndemnityCents: 4000,
          earlyPaymentDiscount: 'néant',
        }),
      ).replace(/[\u00a0\u202f]/gu, ' '),
    ).toBe(
      'Colette Martin a réglé les mentions de paiement de la facture de l’entité émettrice « La Folie Douce SAS » : pénalités de retard 14,15 %, indemnité de recouvrement 40,00 €, escompte « néant »',
    );
    expect(
      sentence(
        entity('legal_entity.invoice_payment_terms_changed', {
          subjectLabel: ENTITY,
          latePenaltyRateBasisPoints: null,
          recoveryIndemnityCents: null,
          earlyPaymentDiscount: null,
        }),
      ),
    ).toBe(
      'Colette Martin a réglé les mentions de paiement de la facture de l’entité émettrice « La Folie Douce SAS » : pénalités de retard à renseigner, indemnité de recouvrement à renseigner, escompte à renseigner',
    );
  });

  it('dit l’ICS attribué, le compte créancier par sa fin, le préavis', () => {
    expect(
      sentence(
        entity('legal_entity.creditor_identifier_assigned', {
          subjectLabel: ENTITY,
          ics: 'FR12ZZZ123456',
        }),
      ),
    ).toBe(
      'Colette Martin a attribué à l’entité émettrice « La Folie Douce SAS » l’identifiant créancier SEPA FR12ZZZ123456',
    );
    expect(
      sentence(
        entity('legal_entity.creditor_account_changed', { subjectLabel: ENTITY, last4: '4321' }),
      ),
    ).toBe(
      'Colette Martin a changé le compte où arrivent les prélèvements de l’entité émettrice « La Folie Douce SAS » : …4321',
    );
  });

  it('dit le schéma d’avant et le nouveau, par leur mot', () => {
    expect(
      sentence(
        entity('legal_entity.mandate_scheme_changed', {
          subjectLabel: ENTITY,
          from: 'CORE',
          to: 'B2B',
        }),
      ),
    ).toBe(
      'Colette Martin a passé les mandats à venir de l’entité émettrice « La Folie Douce SAS » de SEPA CORE à SEPA interentreprises (B2B)',
    );
  });

  it('dit l’archivage et la restauration', () => {
    expect(sentence(entity('legal_entity.restored', { subjectLabel: ENTITY }))).toBe(
      'Colette Martin a restauré l’entité émettrice « La Folie Douce SAS »',
    );
  });
});

describe('les mandats', () => {
  const current = { subjectLabel: 'LFD-2026-0042', company: CAFE, reference: 'LFD-2026-0042' };
  const before = { companyId: 'co_1', reference: 'LFD-2026-0042' };

  it('dit la révocation, et l’état d’avant (l’exemple du guide)', () => {
    const revoked = renderFact(
      mandate('payment_mandate.revoked', { ...current, previousStatus: 'active', via: 'staff' }),
    );

    expect(revoked.sentence).toBe(
      'Colette Martin a révoqué le mandat « LFD-2026-0042 » du client « Café des Halles », qui était actif',
    );
    expect(revoked.detail).toEqual([]);
  });

  it('cite la société par son identifiant sur une ligne d’avant le lot B', () => {
    expect(
      sentence(
        mandate('payment_mandate.revoked', { ...before, previousStatus: 'draft', via: 'staff' }),
      ),
    ).toBe(
      'Colette Martin a révoqué le mandat « LFD-2026-0042 » d’un client (identifiant co_1), qui était en attente de signature',
    );
  });

  it('dit le mandat généré et la preuve déposée', () => {
    expect(sentence(mandate('payment_mandate.minted', { ...current, via: 'customer' }))).toBe(
      'Colette Martin a généré le mandat « LFD-2026-0042 » du client « Café des Halles », à signer',
    );
    expect(
      sentence(
        mandate('payment_mandate.proof_attached', {
          ...before,
          fileName: 'mandat-signe.pdf',
          via: 'staff',
        }),
      ),
    ).toBe(
      'Colette Martin a déposé la preuve signée du mandat « LFD-2026-0042 » d’un client (identifiant co_1), fichier « mandat-signe.pdf »',
    );
  });

  it('dit la signature, sa date et le mandat qu’elle remplace', () => {
    const replacing = sentence(
      mandate('payment_mandate.signed', {
        ...current,
        signedAt: '2026-09-18',
        replacedMandate: { id: 'pm_0', name: 'LFD-2026-0001' },
      }),
    );
    const old = sentence(
      mandate('payment_mandate.signed', {
        ...before,
        signedAt: '2026-09-18',
        replacedMandateId: 'pm_0',
      }),
    );
    const first = sentence(
      mandate('payment_mandate.signed', {
        ...current,
        signedAt: '2026-09-18',
        replacedMandate: null,
      }),
    );

    expect(replacing).toBe(
      'Colette Martin a enregistré la signature du mandat « LFD-2026-0042 » du client « Café des Halles », signé le 18 septembre 2026, qui remplace le mandat « LFD-2026-0001 »',
    );
    expect(old).toBe(
      'Colette Martin a enregistré la signature du mandat « LFD-2026-0042 » d’un client (identifiant co_1), signé le 18 septembre 2026, qui remplace un mandat (identifiant pm_0)',
    );
    expect(first).toBe(
      'Colette Martin a enregistré la signature du mandat « LFD-2026-0042 » du client « Café des Halles », signé le 18 septembre 2026',
    );
  });

  it('dit l’envoi, et qu’un envoi à blanc n’est parti nulle part', () => {
    const sent = renderFact(mandate('payment_mandate.sent', { ...current, providerId: 're_1' }));
    const blank = renderFact(mandate('payment_mandate.sent', { ...current, providerId: null }));

    expect(sent.sentence).toBe(
      'Colette Martin a envoyé le mandat « LFD-2026-0042 » du client « Café des Halles » par e-mail',
    );
    expect(sent.detail).toEqual([{ label: 'Identifiant d’envoi', value: 're_1' }]);
    expect(blank.sentence).toBe(
      'Colette Martin a envoyé le mandat « LFD-2026-0042 » du client « Café des Halles » par e-mail, à blanc : aucun courriel n’est parti',
    );
    expect(blank.detail).toEqual([]);
  });

  it('dit l’annulation d’un brouillon et sa cause', () => {
    expect(
      sentence(
        mandate('payment_mandate.draft_voided', {
          ...current,
          cause: 'bank_account_changed',
          via: 'customer',
        }),
      ),
    ).toBe(
      'Colette Martin a annulé le brouillon du mandat « LFD-2026-0042 » du client « Café des Halles » : le RIB a changé',
    );
  });

  it('dit les options d’un RIB par son titulaire, et laisse les références au détail', () => {
    const options = renderFact({
      ...mandate('payment_mandate.options_changed', {
        subjectLabel: 'Café des Halles SARL',
        company: CAFE,
        debtorReference: 'CLI-42',
        contractNumber: 'C-7',
        via: 'staff',
      }),
      subjectType: 'company_bank_account',
    });
    const old = sentence(
      mandate('payment_mandate.options_changed', {
        companyId: 'co_1',
        debtorReference: 'CLI-42',
        contractNumber: 'C-7',
        via: 'staff',
      }),
    );

    expect(options.sentence).toBe(
      'Colette Martin a modifié les options de mandat du RIB au nom de Café des Halles SARL du client « Café des Halles »',
    );
    expect(options.detail.map((row) => row.label)).toEqual([
      'Référence du débiteur',
      'Numéro de contrat',
    ]);
    expect(old).toBe(
      'Colette Martin a modifié les options de mandat d’un RIB d’un client (identifiant co_1)',
    );
  });

  it('dit l’effacement d’une preuve au passif, avec sa cause', () => {
    const purged = renderFact(
      mandate('payment_mandate.proof_purged', { ...current, cause: 'proof_replaced' }),
    );

    expect(purged.sentence).toBe(
      'La preuve signée du mandat « LFD-2026-0042 » du client « Café des Halles » a été effacée (preuve remplacée)',
    );
    expect(purged.namesActor).toBe(false);
  });
});

describe('le lot de prélèvement figé', () => {
  const batch = {
    subjectLabel: 'Lot B2B 202609',
    legalEntity: { id: 'le_1', name: ENTITY },
    scheme: 'B2B',
    cycleClosesAt: '2026-09-30T22:00:00.000Z',
    lineCount: 3,
    totalCents: 123_400,
  };

  function ofBatch(type: string, payload: Record<string, unknown>): FactInput {
    return { ...entity(type, payload), subjectType: 'collection_batch', subjectId: 'b_1' };
  }

  it('dit la constitution, et nomme les sociétés sans mandat qui la rendent indéposable', () => {
    const constituted = sentence(
      ofBatch('collection.batch_constituted', {
        ...batch,
        depositable: false,
        unmandatedCompanies: ['Chalet Sans Mandat'],
        excludedCount: 1,
      }),
    );

    expect(constituted).toContain('Colette Martin a constitué le lot « Lot B2B 202609 »');
    expect(constituted).toContain('« La Folie Douce SAS »');
    expect(constituted).toContain('non déposable — sans mandat : Chalet Sans Mandat');
  });

  it('dit l’annulation et le dépôt', () => {
    expect(sentence(ofBatch('collection.batch_cancelled', batch))).toContain('a annulé le lot');
    expect(sentence(ofBatch('collection.batch_deposited', batch))).toContain(
      'a marqué déposé le lot',
    );
  });

  it('dit la commande réglée autrement, avec sa note', () => {
    const settled = sentence({
      ...entity('collection.order_settled_otherwise', {
        subjectLabel: 'CMD-42',
        amountCents: 1_200,
        previousState: 'excluded',
        note: 'virement du 3',
      }),
      subjectType: 'order',
      subjectId: 'o_1',
    });

    expect(settled).toContain('a noté la commande « CMD-42 » réglée autrement');
    expect(settled).toContain('« virement du 3 »');
  });
});

describe('l’avis de prélèvement (PA2)', () => {
  const notice = {
    subjectLabel: 'Avis Café des Halles',
    legalEntity: { id: 'le_1', name: ENTITY },
    payer: CAFE,
    kind: 'notice',
    amountCents: 10_550,
    collectionDay: '2026-10-16',
    previousAmountCents: null,
    previousCollectionDay: null,
    recipientSource: 'billing_contact',
  };

  function ofNotice(type: string, payload: Record<string, unknown>): FactInput {
    return { ...entity(type, payload), subjectType: 'collection_notice', subjectId: 'n_1' };
  }

  it('dit la mise en file : payeur, entité, montant, date — jamais l’adresse', () => {
    const queued = sentence(ofNotice('collection.notice_queued', notice));

    expect(queued).toContain('a mis en file l’avis de prélèvement « Avis Café des Halles »');
    expect(queued).toContain('Café des Halles');
    expect(queued).toContain('La Folie Douce SAS');
    expect(queued).toMatch(/105,50\s€/u);
    expect(queued).not.toContain('@');
  });

  it('dit le rectificatif, l’envoi, l’échec et l’avis non envoyable', () => {
    expect(
      sentence(ofNotice('collection.notice_sent', { ...notice, kind: 'correction' })),
    ).toContain('a envoyé l’avis de prélèvement « Avis Café des Halles » (rectificatif)');
    expect(
      sentence(ofNotice('collection.notice_failed', { ...notice, failure: 'rebond dur' })),
    ).toContain('« rebond dur »');
    expect(
      sentence(ofNotice('collection.notice_unsendable', { ...notice, recipientSource: null })),
    ).toContain('ni contact de facturation, ni détenteur');
  });
});

describe('la préparation automatique (PA3)', () => {
  const run = {
    subjectLabel: ENTITY,
    cycleClosesAt: '2026-09-30T22:00:00.000Z',
    batchCount: 0,
  };

  it('dit l’issue et le refus tel quel, l’auteur étant le système', () => {
    const said = sentence({
      ...entity('collection.autopilot_ran', {
        ...run,
        outcome: 'failed',
        message: 'L’entité n’a pas d’ICS.',
      }),
      actorName: null,
      actorType: 'system',
    });

    expect(said).toContain(
      'a tenté la préparation automatique du lot de l’entité émettrice « La Folie Douce SAS »',
    );
    expect(said).toContain(': échec — « L’entité n’a pas d’ICS. »');
  });

  it('un lot préparé : pas de message', () => {
    expect(
      sentence(
        entity('collection.autopilot_ran', {
          ...run,
          outcome: 'constituted',
          batchCount: 1,
          message: null,
        }),
      ),
    ).toMatch(/: lot préparé$/u);
  });
});

/**
 * Régression : la phrase lisait `orderCount` par `optional()`, qui ne lit que
 * du texte, et disait « ? bon(s) » pour toute facture (fix 2026-10-08).
 */
it('la facture émise dit son nombre de bons', () => {
  const issued = sentence({
    ...entity('invoice.issued', {
      subjectLabel: 'FA-2026-000007',
      payer: CAFE,
      orderCount: 3,
      totalCents: 1200,
    }),
    subjectType: 'invoice',
    subjectId: 'inv_1',
  });

  expect(issued).toContain('3 bon(s)');
});

describe('l’e-mail « votre facture » (E6)', () => {
  const notice = { subjectLabel: 'FA-2026-000007', payer: CAFE, recipientCount: 2 };

  function ofInvoice(type: string, payload: Record<string, unknown>): FactInput {
    return { ...entity(type, payload), subjectType: 'invoice', subjectId: 'inv_1' };
  }

  it('dit l’envoi par le nombre de destinataires, jamais leur adresse', () => {
    const sent = sentence(ofInvoice('invoice.notice_sent', notice));

    expect(sent).toContain('a prévenu de la facture « FA-2026-000007 »');
    expect(sent).toContain('Café des Halles');
    expect(sent).toContain('2 destinataire(s)');
    expect(sent).not.toContain('@');
  });

  it('dit l’échec et sa raison', () => {
    expect(
      sentence(
        ofInvoice('invoice.notice_failed', {
          ...notice,
          recipientCount: 0,
          failure: 'personne à prévenir',
        }),
      ),
    ).toContain('n’a pas pu prévenir de la facture « FA-2026-000007 »');
  });

  it('dit le renvoi par le staff, et son refus s’il y en a un (suite (b))', () => {
    expect(sentence(ofInvoice('invoice.notice_resent', { ...notice, failure: null }))).toContain(
      'a renvoyé l’e-mail de la facture « FA-2026-000007 »',
    );
    expect(
      sentence(ofInvoice('invoice.notice_resent', { ...notice, failure: 'rebond dur' })),
    ).toContain('n’a pas pu renvoyer l’e-mail de la facture « FA-2026-000007 » ');
  });
});

describe('le PDF Factur-X de la pièce (E3b)', () => {
  const document = { subjectLabel: 'FA-2026-000007', payer: CAFE, kind: 'invoice' };

  function ofInvoice(type: string, payload: Record<string, unknown>): FactInput {
    return { ...entity(type, payload), subjectType: 'invoice', subjectId: 'inv_1' };
  }

  it('dit le rendu par sa taille, jamais la clé de stockage', () => {
    const rendered = sentence(
      ofInvoice('invoice.document_rendered', {
        ...document,
        byteCount: 48213,
        sha256: 'a'.repeat(64),
      }),
    );

    expect(rendered).toContain('a rendu le PDF Factur-X de la facture « FA-2026-000007 »');
    expect(rendered).toContain('48213 octets');
    expect(rendered).not.toContain('invoices/');
  });

  it('un avoir se dit avoir ; l’échec dit sa raison', () => {
    const failed = sentence(
      ofInvoice('invoice.document_render_failed', {
        ...document,
        kind: 'credit_note',
        failure: 'police illisible',
      }),
    );

    expect(failed).toContain('n’a pas pu rendre le PDF Factur-X de l’avoir « FA-2026-000007 »');
    expect(failed).toContain('police illisible');
  });
});

describe('l’export des mandats pour la banque', () => {
  const exported = { subjectLabel: ENTITY, mandateCount: 3 };

  it('dit l’entité et le nombre de mandats, jamais un compte', () => {
    expect(sentence(entity('mandate_bank_export.created', exported))).toContain(
      'a préparé l’export des mandats pour la banque de l’entité émettrice « La Folie Douce SAS » : 3 mandats',
    );
    expect(
      sentence(entity('mandate_bank_export.imported', { ...exported, mandateCount: 1 })),
    ).toContain('a marqué importé à la banque l’export des mandats de l’entité émettrice');
    expect(
      sentence(entity('mandate_bank_export.imported', { ...exported, mandateCount: 1 })),
    ).toMatch(/: 1 mandat$/u);
  });
});
