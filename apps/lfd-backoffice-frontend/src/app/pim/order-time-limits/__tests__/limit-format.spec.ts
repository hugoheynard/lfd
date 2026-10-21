import { describe, expect, it } from 'vitest';

import type { OrderTimeLimitView } from '@lfd/pim-contracts';

import {
  byName,
  daysPhrase,
  generalCutoffPhrase,
  gracePhrase,
  limitPhrase,
  scopeLabel,
} from '../limit-format';

function rule(over: Partial<OrderTimeLimitView> = {}): OrderTimeLimitView {
  return {
    id: 'l1',
    scope: { type: 'product', id: 'p1' },
    scopeLabel: 'Bûche',
    daysBefore: 2,
    time: '12:00',
    graceMinutes: null,
    ...over,
  };
}

describe('scopeLabel', () => {
  it('rend le nom résolu par le serveur', () => {
    expect(scopeLabel(rule())).toBe('Bûche');
  });

  /** Une règle dont la cible n'a pas de nom s'affiche quand même. */
  it("montre l'identifiant quand la cible n'a pas été retrouvée", () => {
    expect(
      scopeLabel(rule({ scopeLabel: null, scope: { type: 'product', id: 'p_disparu' } })),
    ).toBe('p_disparu');
  });
});

describe('les phrases', () => {
  it('dit le délai en phrase, pas en J−N', () => {
    expect(daysPhrase(0)).toBe('Le jour même');
    expect(daysPhrase(1)).toBe('La veille');
    expect(daysPhrase(2)).toBe("L'avant-veille");
    expect(daysPhrase(3)).toBe('3 jours avant');
  });

  it('dit le rattrapage en clair', () => {
    expect(gracePhrase(0)).toBe('Aucun');
    expect(gracePhrase(60)).toBe('1 h');
    expect(gracePhrase(45)).toBe('45 min');
  });

  it('dit la limite du produit en une ligne', () => {
    expect(limitPhrase(rule())).toBe("L'avant-veille, 12:00");
  });

  it("dit qu'une ligne incomplète ne s'applique pas", () => {
    expect(limitPhrase(rule({ time: null }))).toBe('Incomplète — ne s’applique pas');
  });

  it('trie par nom de produit', () => {
    const sorted = [rule({ scopeLabel: 'Tarte' }), rule({ scopeLabel: 'Bûche' })].sort(byName);
    expect(sorted.map(scopeLabel)).toEqual(['Bûche', 'Tarte']);
  });
});

describe('generalCutoffPhrase', () => {
  it('dit la règle générale du commerce', () => {
    expect(
      generalCutoffPhrase({
        rule: { daysBefore: 1, time: '18:00', graceMinutes: 0 },
      }),
    ).toBe('La veille à 18:00, rattrapage aucun');
  });

  it("rend null quand le commerce n'en a pas", () => {
    expect(generalCutoffPhrase({ rule: null })).toBeNull();
  });
});
