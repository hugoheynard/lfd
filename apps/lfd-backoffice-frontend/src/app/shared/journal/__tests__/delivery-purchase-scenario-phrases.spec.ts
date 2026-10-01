import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/** **Les phrases des scénarios d'achat** (`plan-bibliotheque-d-achat.md`, B-D5, lot B3). */

function fact(type: string, payload: Record<string, unknown>): FactInput {
  return {
    type,
    payload,
    subjectType: 'delivery_purchase_scenario',
    subjectId: 'ps_1',
    actorName: 'Colette Martin',
    actorType: 'staff',
  };
}

function sentence(input: FactInput): string {
  return renderFact(input).sentence.replace(/\s/gu, ' ');
}

describe('les scénarios d’achat (delivery_purchase_scenario.*)', () => {
  it('dit un scénario enregistré, avec la taille de sa sélection', () => {
    expect(
      sentence(
        fact('delivery_purchase_scenario.created', {
          subjectLabel: 'Kangoo et caisses',
          vehicles: 1,
          formats: 3,
        }),
      ),
    ).toBe(
      'Colette Martin a enregistré le scénario d’achat « Kangoo et caisses » (1 véhicule, 3 formats)',
    );
  });

  it('dit l’ancien nom d’un scénario remplacé et renommé', () => {
    expect(
      sentence(
        fact('delivery_purchase_scenario.replaced', {
          subjectLabel: 'Nouveau',
          renamedFrom: 'Ancien',
          vehicles: 2,
          formats: 1,
        }),
      ),
    ).toContain(
      'a remplacé le scénario d’achat « Nouveau » (2 véhicules, 1 format), autrefois « Ancien »',
    );
  });

  it('dit l’archivage et la réactivation', () => {
    expect(
      sentence(fact('delivery_purchase_scenario.archived', { subjectLabel: 'Essai' })),
    ).toContain('a archivé le scénario d’achat « Essai »');
    expect(
      sentence(fact('delivery_purchase_scenario.reactivated', { subjectLabel: 'Essai' })),
    ).toContain('a réactivé le scénario d’achat « Essai »');
  });
});
