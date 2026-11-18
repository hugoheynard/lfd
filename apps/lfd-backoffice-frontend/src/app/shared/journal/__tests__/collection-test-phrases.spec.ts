import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/**
 * **Les phrases du prélèvement d'essai** (plan `plan-prelevement-d-essai.md`) :
 * chaque fait se dit en une phrase, sans IBAN ni RUM, et le détail n'a rien à
 * ajouter (toutes les clés sont consommées).
 */

function onCompany(type: string, payload: Record<string, unknown>): FactInput {
  return {
    type,
    payload: { subjectLabel: 'Folie Douce Val', ...payload },
    subjectType: 'company',
    subjectId: 'co_1',
    actorName: 'Colette Martin',
    actorType: 'staff',
  };
}

const TEST = {
  messageId: 'ESS-01JBQ7Z5K8M3QT9P2X4BE55F00',
  endToEndId: 'ESS-01JBQ7Z5K8M3QT9P2X4BE55A00',
  amountCents: 100,
};

/** Un fait d'avant l'envoi à plusieurs débiteurs : le `MsgId` seul, égal à la ligne. */
const SINGLE_FILE_TEST = { messageId: 'ESS-01JBQ7Z5K8M3QT9P2X4BE55A00', amountCents: 100 };

const LINE_IN_FILE =
  'l’essai ESS-01JBQ7Z5K8M3QT9P2X4BE55A00 (envoi ESS-01JBQ7Z5K8M3QT9P2X4BE55F00)';

const GENERATED = {
  sequence: 'FRST',
  scheme: 'B2B',
  collectionDay: '2026-11-05',
  legalEntity: { id: 'le_1', name: 'La Folie Douce' },
};

const RETURNED = {
  kind: 'reject',
  reasonCode: 'AM04',
  reason: 'Provision insuffisante',
  returnedOn: '2026-11-05',
  source: 'pain002',
};

describe('le prélèvement d’essai au journal', () => {
  it('dit la déclaration et le retrait d’un établissement', () => {
    expect(renderFact(onCompany('collection.own_establishment_declared', {})).sentence).toBe(
      'Colette Martin a déclaré « Folie Douce Val » parmi nos établissements',
    );
    expect(renderFact(onCompany('collection.own_establishment_withdrawn', {})).sentence).toBe(
      'Colette Martin a retiré « Folie Douce Val » de nos établissements',
    );
  });

  it('dit la génération : la ligne, son envoi, montant, séquence, échéance, entité', () => {
    const said = renderFact(
      onCompany('collection.test_generated', { ...TEST, fileId: 'f_1', ...GENERATED }),
    );

    expect(said.sentence).toContain(`a généré ${LINE_IN_FILE}`);
    expect(said.sentence).toContain('1,00');
    expect(said.sentence).toContain('FRST');
    expect(said.sentence).toContain('« La Folie Douce »');
    expect(said.consumed).toEqual(expect.arrayContaining(['endToEndId', 'fileId', 'messageId']));
    expect(said.detail).toEqual([]);
  });

  it('dit le remboursement et le retour, avec la ligne et son envoi', () => {
    const refunded = renderFact(
      onCompany('collection.test_refunded', { ...TEST, refundedOn: '2026-11-06' }),
    );
    expect(refunded.sentence).toContain(`a marqué remboursé ${LINE_IN_FILE}`);
    expect(refunded.detail).toEqual([]);

    const returned = renderFact(onCompany('collection.test_returned', { ...TEST, ...RETURNED }));
    expect(returned.sentence).toContain(LINE_IN_FILE);
    expect(returned.sentence).toContain('(AM04 : Provision insuffisante)');
    expect(returned.detail).toEqual([]);
  });

  it('dit un fait d’avant l’envoi à plusieurs débiteurs par son seul MsgId', () => {
    const generated = renderFact(
      onCompany('collection.test_generated', { ...SINGLE_FILE_TEST, ...GENERATED }),
    ).sentence;
    const refunded = renderFact(
      onCompany('collection.test_refunded', { ...SINGLE_FILE_TEST, refundedOn: '2026-11-06' }),
    ).sentence;
    const returned = renderFact(
      onCompany('collection.test_returned', { ...SINGLE_FILE_TEST, ...RETURNED }),
    ).sentence;

    expect(generated).toContain('a généré l’essai ESS-01JBQ7Z5K8M3QT9P2X4BE55A00 de');
    expect(refunded).toContain('a marqué remboursé l’essai ESS-01JBQ7Z5K8M3QT9P2X4BE55A00 de');
    expect(returned).toContain('de l’essai ESS-01JBQ7Z5K8M3QT9P2X4BE55A00 de');
    for (const sentence of [generated, refunded, returned]) {
      expect(sentence).not.toContain('envoi');
    }
  });

  it('dit l’export du RIB depuis l’essai, sans IBAN', () => {
    const said = renderFact(
      onCompany('collection.test_bank_account_exported', {
        legalEntity: { id: 'le_1', name: 'La Folie Douce' },
      }),
    );

    expect(said.sentence).toContain('a exporté pour la banque le RIB de « Folie Douce Val »');
    expect(said.sentence).toContain('« La Folie Douce »');
  });
});
