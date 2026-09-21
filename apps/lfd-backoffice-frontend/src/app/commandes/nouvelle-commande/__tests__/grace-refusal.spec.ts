import { describe, expect, it } from 'vitest';

import { isGraceRefusal } from '../grace-refusal';

/** Une réponse d'erreur telle qu'Angular la remonte : l'enveloppe sous `error`. */
function httpError(code: string): unknown {
  return { status: 409, error: { code, message: 'peu importe', requestId: 'r1' } };
}

describe('isGraceRefusal', () => {
  it('reconnaît le refus rattrapable', () => {
    expect(isGraceRefusal(httpError('orders.cutoff.grace'))).toBe(true);
  });

  /**
   * 🔴 Le refus DÉFINITIF n'en est pas un. Après la grâce personne n'ouvre, et
   * proposer une dérogation là coûterait un appel pour rien — plus la confiance
   * qui va avec.
   */
  it('ne propose rien sur un refus définitif', () => {
    expect(isGraceRefusal(httpError('orders.cutoff.past'))).toBe(false);
  });

  it('ignore les autres refus', () => {
    expect(isGraceRefusal(httpError('orders.pickup.closed_at_requested_time'))).toBe(false);
  });

  /**
   * Une requête qui n'a pas atteint le serveur n'a pas de corps. Sans ce cas,
   * une coupure réseau ferait apparaître un bandeau de rattrapage sur une
   * commande dont on ne sait rien.
   */
  it('ne se déclenche pas sur une panne réseau', () => {
    expect(isGraceRefusal({ status: 0, error: null })).toBe(false);
    expect(isGraceRefusal(new Error('offline'))).toBe(false);
    expect(isGraceRefusal(null)).toBe(false);
  });

  it('ne se déclenche pas sur une enveloppe sans code', () => {
    expect(isGraceRefusal({ status: 409, error: { message: 'sans code' } })).toBe(false);
  });
});
