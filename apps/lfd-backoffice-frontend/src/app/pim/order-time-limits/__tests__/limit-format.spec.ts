import { describe, expect, it } from 'vitest';

import type { OrderTimeLimitView } from '@lfd/pim-contracts';

import {
  absenceLabel,
  byPrecision,
  daysPhrase,
  gracePhrase,
  scopeLabel,
  timePhrase,
} from '../limit-format';

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
    expect(daysPhrase(0, 'product')).toBe('Le jour même');
    expect(daysPhrase(1, 'product')).toBe('La veille');
    expect(daysPhrase(2, 'product')).toBe("L'avant-veille");
    expect(daysPhrase(5, 'product')).toBe('5 jours avant');
  });

  /**
   * 🔴 `null` se dit **Hérité**, jamais un blanc. Un champ vide se lit « aucune
   * limite » — c'est-à-dire exactement l'inverse de ce que `null` veut dire.
   */
  it('écrit « Hérité » plutôt que rien, sous le rang global', () => {
    expect(daysPhrase(null, 'category')).toBe('Hérité');
    expect(timePhrase(null, 'product')).toBe('Hérité');
    expect(gracePhrase(null, 'variant')).toBe('Hérité');
  });

  /**
   * 🔴 **Le rang global est la RACINE : il n'hérite de rien.**
   *
   * Y écrire « Hérité » envoyait chercher une règle plus haut, qu'on ne trouvait
   * jamais. Ce que l'absence veut dire là-bas est tout autre, et bien plus
   * lourd : sans délai ni heure, aucune limite ne s'applique nulle part.
   */
  it("n'écrit JAMAIS « Hérité » au rang global", () => {
    expect(daysPhrase(null, 'global')).toBe('Non défini');
    expect(timePhrase(null, 'global')).toBe('Non défini');
  });

  /**
   * Le rattrapage fait exception à l'exception : son absence a une valeur par
   * défaut honnête — la limite est ferme —, et au rang global cette valeur EST
   * la réponse.
   */
  it('dit « Aucun » et non « Non défini » pour un rattrapage global absent', () => {
    expect(gracePhrase(null, 'global')).toBe('Aucun');
    expect(absenceLabel('global', 'graceMinutes')).toBe('Aucun');
    expect(absenceLabel('global', 'daysBefore')).toBe('Non défini');
    expect(absenceLabel('category', 'graceMinutes')).toBe('Hérité');
  });

  /**
   * `0` de rattrapage est une DÉCISION — la limite est ferme —, pas un silence.
   * Les confondre ferait croire qu'un rang supérieur peut encore l'ouvrir.
   */
  it('distingue un rattrapage nul EXPLICITE d’un rattrapage hérité', () => {
    expect(gracePhrase(0, 'category')).toBe('Aucun');
    expect(gracePhrase(null, 'category')).toBe('Hérité');
  });

  it('dit les heures rondes en heures', () => {
    expect(gracePhrase(45, 'global')).toBe('45 min');
    expect(gracePhrase(60, 'global')).toBe('1 h');
    expect(gracePhrase(120, 'global')).toBe('2 h');
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
