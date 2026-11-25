import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/** **Le niveau de suivi d'un poste** (`fournil/les-niveaux-de-suivi.md`). */

function fact(payload: Record<string, unknown>): FactInput {
  return {
    type: 'production_workstation.tracking_level_set',
    payload,
    subjectType: 'production_workstation',
    subjectId: 'ws-1',
    actorName: 'Colette Martin',
    actorType: 'staff',
  };
}

function sentence(input: FactInput): string {
  return renderFact(input).sentence.replace(/\s/gu, ' ');
}

describe('le suivi d’un poste (production_workstation.tracking_level_set)', () => {
  it('dit le niveau propre posé, et que le poste suivait le fournil', () => {
    const set = fact({
      subjectLabel: 'Pâtisserie',
      trackingLevel: 'detailed',
      previous: { trackingLevel: null },
    });
    expect(sentence(set)).toBe(
      'Colette Martin a réglé le suivi du poste Pâtisserie : détaillé ; il suivait le fournil',
    );
    expect(renderFact(set).detail).toEqual([]);
  });

  it('dit le retour au niveau du fournil', () => {
    const back = fact({
      subjectLabel: 'Pâtisserie',
      trackingLevel: null,
      previous: { trackingLevel: 'simple' },
    });
    expect(sentence(back)).toBe(
      'Colette Martin a remis le poste Pâtisserie au niveau de suivi du fournil ; c’était simple',
    );
  });
});

/** **Un produit sur plusieurs postes** (`fournil/plan-produit-sur-plusieurs-postes.md`, § 2.5). */
function stationFact(type: string, payload: Record<string, unknown>): FactInput {
  return { ...fact(payload), type };
}

describe('les postes d’un produit', () => {
  it('dit le poste ajouté et à combien de produits', () => {
    const added = stationFact('production_workstation.products_workstation_added', {
      subjectLabel: 'Boulangerie',
      workstation: { id: 'ws-1', name: 'Boulangerie' },
      skus: ['SAN-001', 'PAI-003'],
      count: 2,
      finishingSkus: ['PAI-003'],
    });
    expect(sentence(added)).toBe('Colette Martin a ajouté le poste Boulangerie à 2 produits');
    expect(renderFact(added).detail).toEqual([]);
  });

  it('dit le poste retiré', () => {
    const removed = stationFact('production_workstation.products_workstation_removed', {
      subjectLabel: 'Boulangerie',
      workstation: { id: 'ws-1', name: 'Boulangerie' },
      skus: ['SAN-001'],
      count: 1,
      unplacedSkus: [],
    });
    expect(sentence(removed)).toBe('Colette Martin a retiré le poste Boulangerie de 1 produit');
  });

  it('dit le poste qui finit, et celui qui finissait', () => {
    const set = stationFact('production_workstation.finishing_workstation_set', {
      subjectLabel: 'Boulangerie',
      workstation: { id: 'ws-1', name: 'Boulangerie' },
      sku: 'SAN-001',
      previous: { workstation: { id: 'ws-2', name: 'Salé traiteur' } },
    });
    expect(sentence(set)).toBe(
      'Colette Martin a désigné le poste Boulangerie pour finir SAN-001 ; c’était Salé traiteur',
    );
  });
});
