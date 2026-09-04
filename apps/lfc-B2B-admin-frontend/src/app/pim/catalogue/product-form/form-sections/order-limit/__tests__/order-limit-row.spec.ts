import { describe, expect, it } from 'vitest';

import type { OrderTimeLimitView } from '@lfd/pim-contracts';

import { ownRule } from '../order-limit-row';

function rule(type: OrderTimeLimitView['scope']['type'], id: string | null): OrderTimeLimitView {
  return {
    id: `${type}:${id ?? ''}`,
    scope: { type, id },
    scopeLabel: null,
    daysBefore: 1,
    time: '18:00',
    graceMinutes: null,
  };
}

const ALL: readonly OrderTimeLimitView[] = [
  rule('global', null),
  rule('category', 'patisserie'),
  rule('product', 'p1'),
  rule('variant', 'v1'),
];

describe('ownRule', () => {
  it('trouve la règle posée sur cette portée', () => {
    expect(ownRule(ALL, 'product', 'p1')?.id).toBe('product:p1');
    expect(ownRule(ALL, 'variant', 'v1')?.id).toBe('variant:v1');
  });

  /**
   * 🔴 **La fiche ne montre que ce qu'ELLE pose.** Rendre la règle de la famille
   * — ou la globale — sur la ligne du produit ferait croire qu'on la modifie en
   * modifiant ici, et on en poserait une seconde copie sur le produit sans s'en
   * rendre compte. Le jour où la famille change, cette copie ne suivrait pas.
   */
  it('ne remonte JAMAIS ce dont la fiche hérite', () => {
    expect(ownRule(ALL, 'product', 'p_sans_regle')).toBeNull();
    expect(ownRule(ALL, 'variant', 'v_sans_regle')).toBeNull();
  });

  it('distingue une portée produit d’une portée déclinaison de même identifiant', () => {
    const collision = [rule('variant', 'x'), rule('product', 'x')];
    expect(ownRule(collision, 'product', 'x')?.scope.type).toBe('product');
    expect(ownRule(collision, 'variant', 'x')?.scope.type).toBe('variant');
  });

  it('rend null sur une liste vide', () => {
    expect(ownRule([], 'product', 'p1')).toBeNull();
  });
});
