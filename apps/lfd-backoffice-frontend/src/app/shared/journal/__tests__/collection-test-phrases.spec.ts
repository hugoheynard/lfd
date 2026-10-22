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

const TEST = { messageId: 'ESS-01JBQ7Z5K8M3QT9P2X4BE55A00', amountCents: 100 };

describe('le prélèvement d’essai au journal', () => {
  it('dit la déclaration et le retrait d’un établissement', () => {
    expect(renderFact(onCompany('collection.own_establishment_declared', {})).sentence).toBe(
      'Colette Martin a déclaré « Folie Douce Val » parmi nos établissements',
    );
    expect(renderFact(onCompany('collection.own_establishment_withdrawn', {})).sentence).toBe(
      'Colette Martin a retiré « Folie Douce Val » de nos établissements',
    );
  });

  it('dit la génération : référence, montant, séquence, échéance, entité', () => {
    const said = renderFact(
      onCompany('collection.test_generated', {
        ...TEST,
        sequence: 'FRST',
        scheme: 'B2B',
        collectionDay: '2026-11-05',
        legalEntity: { id: 'le_1', name: 'La Folie Douce' },
      }),
    );

    expect(said.sentence).toContain('a généré l’essai ESS-01JBQ7Z5K8M3QT9P2X4BE55A00');
    expect(said.sentence).toContain('1,00');
    expect(said.sentence).toContain('FRST');
    expect(said.sentence).toContain('« La Folie Douce »');
  });

  it('dit le remboursement et le retour', () => {
    expect(
      renderFact(onCompany('collection.test_refunded', { ...TEST, refundedOn: '2026-11-06' }))
        .sentence,
    ).toContain('a marqué remboursé l’essai ESS-01JBQ7Z5K8M3QT9P2X4BE55A00');
    expect(
      renderFact(
        onCompany('collection.test_returned', {
          ...TEST,
          kind: 'reject',
          reasonCode: 'AM04',
          reason: 'Provision insuffisante',
          returnedOn: '2026-11-05',
          source: 'pain002',
        }),
      ).sentence,
    ).toContain('(AM04 : Provision insuffisante)');
  });
});
