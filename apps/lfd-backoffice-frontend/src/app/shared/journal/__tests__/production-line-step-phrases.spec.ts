import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/** **Les étapes d'une ligne** (`fournil/plan-produit-sur-plusieurs-postes.md`, § 2.6). */

function fact(type: string, payload: Record<string, unknown>): FactInput {
  return {
    type,
    payload,
    subjectType: 'production_line_step',
    subjectId: '2026-11-25:SAN:ws-boul',
    actorName: 'Colette Martin',
    actorType: 'staff',
  };
}

function sentence(input: FactInput): string {
  return renderFact(input).sentence.replace(/\s/gu, ' ');
}

const STEP = {
  subjectLabel: 'Sandwich jambon',
  serviceDay: '2026-11-25',
  sku: 'SAN',
  workstationId: 'ws-boul',
  workstationName: 'Boulangerie',
  version: 1,
};

describe('les étapes (production_line.*)', () => {
  it('dit l’étape faite et son poste, sans détail résiduel', () => {
    const done = fact('production_line.step_done', STEP);
    expect(sentence(done)).toBe(
      'Colette Martin a fait l’étape de Sandwich jambon au poste Boulangerie',
    );
    expect(renderFact(done).detail).toEqual([]);
  });

  it('dit le rouge avec sa raison', () => {
    const red = fact('production_line.step_red', { ...STEP, reason: 'pas de farine' });
    expect(sentence(red)).toBe(
      'Colette Martin a mis en rouge l’étape de Sandwich jambon au poste Boulangerie — pas de farine',
    );
    expect(renderFact(red).detail).toEqual([]);
  });

  it('dit le rouge sans raison', () => {
    const red = fact('production_line.step_red', { ...STEP, reason: null });
    expect(sentence(red)).toBe(
      'Colette Martin a mis en rouge l’étape de Sandwich jambon au poste Boulangerie',
    );
  });

  it('dit l’étape décochée', () => {
    expect(sentence(fact('production_line.step_undone', STEP))).toBe(
      'Colette Martin a décoché l’étape de Sandwich jambon au poste Boulangerie',
    );
  });
});
