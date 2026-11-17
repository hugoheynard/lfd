import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/** **Les problèmes du fournil** (`fournil/les-niveaux-de-suivi.md`). */

function fact(type: string, payload: Record<string, unknown>): FactInput {
  return {
    type,
    payload,
    subjectType: 'production_problem',
    subjectId: 'pb-1',
    actorName: 'Colette Martin',
    actorType: 'staff',
  };
}

function sentence(input: FactInput): string {
  return renderFact(input).sentence.replace(/\s/gu, ' ');
}

const REPORTED = {
  subjectLabel: 'Croissant',
  serviceDay: '2026-11-18',
  sku: 'CRO',
  expected: 120,
  output: 120,
  produced: 80,
  reason: 'four en panne',
  version: 1,
  correctedBatches: [
    { batchId: 'b2', corrected: 30 },
    { batchId: 'b1', corrected: 5 },
  ],
  uncorrected: 5,
  declared: 0,
};

describe('le rouge (production_problem.reported)', () => {
  it('dit le sorti, l’attendu, la raison, et ce que le rouge a fait des fournées', () => {
    const reported = fact('production_problem.reported', REPORTED);
    expect(sentence(reported)).toBe(
      'Colette Martin a signalé un problème au fournil sur Croissant : 80 pièces sorties sur 120 attendues — four en panne ; 35 pièces corrigées sur les fournées ; 5 pièces restées à corriger',
    );
    expect(renderFact(reported).detail).toEqual([]);
  });

  it('dit les pièces ajoutées quand le rouge dit plus que sorti', () => {
    const more = fact('production_problem.reported', {
      ...REPORTED,
      reason: null,
      produced: 130,
      correctedBatches: [],
      uncorrected: 0,
      declared: 10,
    });
    expect(sentence(more)).toBe(
      'Colette Martin a signalé un problème au fournil sur Croissant : 130 pièces sorties sur 120 attendues ; 10 pièces ajoutées par une fournée',
    );
  });
});

describe('traité (production_problem.resolved)', () => {
  it('dit qui l’a pris en charge', () => {
    const done = fact('production_problem.resolved', {
      subjectLabel: 'Croissant',
      serviceDay: '2026-11-18',
      sku: 'CRO',
      produced: 80,
      version: 2,
    });
    expect(sentence(done)).toBe(
      'Colette Martin a marqué traité le problème du fournil sur Croissant',
    );
  });
});
