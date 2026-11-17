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
