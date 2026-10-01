import type { StopDecisionView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { decisionBadgeOf, decisionStatusOf } from './stop-decisions';

// Un instant recopié, jamais comparé à l'horloge.
const AT = '2030-03-12T08:12:00.000Z';

function decision(overrides: Partial<StopDecisionView> = {}): StopDecisionView {
  return { state: 'pending', source: null, decidedAt: null, decidedByName: null, ...overrides };
}

describe('la décision du commercial, en mots (B3)', () => {
  it('sur la carte du livreur : en attente, autorisé, rapporté — rien sans décision', () => {
    expect(decisionBadgeOf(null)).toBeNull();
    expect(decisionBadgeOf(decision())?.label).toBe('En attente du commercial');
    expect(decisionBadgeOf(decision({ state: 'authorize_deposit' }))).toEqual({
      label: 'Autorisé : déposer',
      variant: 'success',
    });
    expect(decisionBadgeOf(decision({ state: 'bring_back' }))?.label).toBe('Rapporté');
  });

  it('dans la liste : qui a décidé, et quand — l’auteur peut manquer à l’annuaire', () => {
    expect(decisionStatusOf(decision())).toBe('À décider');
    expect(
      decisionStatusOf(
        decision({ state: 'authorize_deposit', decidedAt: AT, decidedByName: 'Léa Martin' }),
      ),
    ).toMatch(/^Dépôt autorisé à .+ par Léa Martin$/u);
    expect(decisionStatusOf(decision({ state: 'bring_back', decidedAt: AT }))).toMatch(
      /^Rapporté à [^p]+$/u,
    );
  });
});
