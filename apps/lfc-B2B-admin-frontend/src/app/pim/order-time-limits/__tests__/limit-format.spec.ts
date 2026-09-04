import { describe, expect, it } from 'vitest';

import type { OrderTimeLimitView } from '@lfd/pim-contracts';

import { byPrecision, daysPhrase, gracePhrase, scopeLabel, timePhrase } from '../limit-format';

function rule(over: Partial<OrderTimeLimitView> = {}): OrderTimeLimitView {
  return {
    id: 'l1',
    scope: { type: 'global', id: null },
    scopeLabel: null,
    daysBefore: null,
    time: null,
    graceMinutes: null,
    ...over,
  };
}

describe('scopeLabel', () => {
  it('nomme la portée globale sans cible', () => {
    expect(scopeLabel(rule())).toBe('Toute la production');
  });

  it('rend le nom résolu par le serveur', () => {
    const cible = rule({ scope: { type: 'category', id: 'c1' }, scopeLabel: 'Viennoiseries' });
    expect(scopeLabel(cible)).toBe('Viennoiseries');
  });

  /**
   * Une règle dont la cible n'a pas de nom **s'affiche quand même**. Elle
   * s'applique ; l'effacer avec son nom la rendrait invisible tout en la
   * laissant agir — l'état le pire des deux.
   */
  it("montre l'identifiant quand la cible n'a pas été retrouvée", () => {
    const orpheline = rule({ scope: { type: 'product', id: 'p_disparu' }, scopeLabel: null });
    expect(scopeLabel(orpheline)).toBe('p_disparu');
  });
});

describe('les trois valeurs, et ce que leur absence dit', () => {
  it('dit le délai en phrase, pas en J−N', () => {
    expect(daysPhrase(0)).toBe('Le jour même');
    expect(daysPhrase(1)).toBe('La veille');
    expect(daysPhrase(2)).toBe("L'avant-veille");
    expect(daysPhrase(5)).toBe('5 jours avant');
  });

  /**
   * 🔴 `null` se dit **Hérité**, jamais un blanc. Un champ vide se lit « aucune
   * limite » — c'est-à-dire exactement l'inverse de ce que `null` veut dire.
   */
  it('écrit « Hérité » plutôt que rien', () => {
    expect(daysPhrase(null)).toBe('Hérité');
    expect(timePhrase(null)).toBe('Hérité');
    expect(gracePhrase(null)).toBe('Hérité');
  });

  /**
   * `0` de rattrapage est une DÉCISION — la limite est ferme —, pas un silence.
   * Les confondre ferait croire qu'un rang supérieur peut encore l'ouvrir.
   */
  it('distingue un rattrapage nul EXPLICITE d’un rattrapage hérité', () => {
    expect(gracePhrase(0)).toBe('Aucun');
    expect(gracePhrase(null)).toBe('Hérité');
  });

  it('dit les heures rondes en heures', () => {
    expect(gracePhrase(45)).toBe('45 min');
    expect(gracePhrase(60)).toBe('1 h');
    expect(gracePhrase(120)).toBe('2 h');
  });
});

describe('byPrecision', () => {
  /**
   * Du général au précis, parce que l'écran raconte un **héritage** : on le lit
   * en partant de ce dont on hérite. L'ordre inverse ferait lire les exceptions
   * avant la règle.
   */
  it('classe du plus général au plus précis', () => {
    const ordered = [
      rule({ id: 'v', scope: { type: 'variant', id: 'v1' }, scopeLabel: 'SEAU' }),
      rule({ id: 'g' }),
      rule({ id: 'p', scope: { type: 'product', id: 'p1' }, scopeLabel: 'Entremets' }),
      rule({ id: 'c', scope: { type: 'category', id: 'c1' }, scopeLabel: 'Pâtisserie' }),
    ].sort(byPrecision);

    expect(ordered.map((entry) => entry.id)).toEqual(['g', 'c', 'p', 'v']);
  });

  it('classe deux portées de même rang par leur nom', () => {
    const ordered = [
      rule({ id: 'b', scope: { type: 'category', id: 'c2' }, scopeLabel: 'Viennoiseries' }),
      rule({ id: 'a', scope: { type: 'category', id: 'c1' }, scopeLabel: 'Pâtisserie' }),
    ].sort(byPrecision);

    expect(ordered.map((entry) => entry.id)).toEqual(['a', 'b']);
  });
});
