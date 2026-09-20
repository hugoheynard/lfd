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
