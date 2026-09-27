import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/**
 * **Les phrases de la fidélité** — le titulaire, préposition et article
 * contractés. Régression : le cycle d'un bon écrivait « de le client « X » »
 * (corrigé le 2026-09-27).
 */

function fact(type: string, payload: Record<string, unknown>): FactInput {
  return {
    type,
    payload,
    subjectType: 'customer',
    subjectId: 'cu_1',
    actorName: 'Colette Martin',
    actorType: 'staff',
  };
}

function sentence(type: string, payload: Record<string, unknown>): string {
  return renderFact(fact(type, payload)).sentence;
}

const NAMED = { subjectLabel: 'Jeanne Dupont' };
const VOUCHER = { voucher: 'lv_1', valueCents: 500, pointsCost: 1000, reason: 'erreur' };
const CYCLE = [
  'loyalty.voucher_issued',
  'loyalty.voucher_expired',
  'loyalty.voucher_cancelled',
] as const;

describe('le titulaire dans le cycle d’un bon', () => {
  for (const type of CYCLE) {
    it(`${type} : « du client « X » », jamais « de le »`, () => {
      const said = sentence(type, { ...NAMED, ...VOUCHER });
      expect(said).toContain(' du client « Jeanne Dupont »');
      expect(said).not.toContain('de le');
    });

    it(`${type} : « d’un client » sans nom`, () => {
      const said = sentence(type, VOUCHER);
      expect(said).toContain(' d’un client');
      expect(said).not.toContain('de un');
    });
  }
});

describe('le titulaire hors du cycle d’un bon', () => {
  it('crédite « au client », ou « à un client »', () => {
    const payload = { points: 120, order: 'or_1' };
    expect(sentence('loyalty.points_earned', { ...NAMED, ...payload })).toContain(
      ' de fidélité au client « Jeanne Dupont » pour ',
    );
    expect(sentence('loyalty.points_earned', payload)).toContain(' de fidélité à un client pour ');
  });

  it('ajuste « le solde de fidélité du client », ou « d’un client »', () => {
    const payload = { points: 500, reason: 'geste' };
    expect(sentence('loyalty.points_adjusted', { ...NAMED, ...payload })).toContain(
      ' le solde de fidélité du client « Jeanne Dupont » : « geste »',
    );
    expect(sentence('loyalty.points_adjusted', payload)).toContain(
      ' le solde de fidélité d’un client : « geste »',
    );
  });

  it('émet un reliquat « pour le client », ou « pour un client »', () => {
    const payload = { voucher: 'lv_2', parent: 'lv_1', order: 'or_1', valueCents: 200 };
    expect(sentence('loyalty.voucher_remainder_issued', { ...NAMED, ...payload })).toContain(
      ' pour le client « Jeanne Dupont », ',
    );
    expect(sentence('loyalty.voucher_remainder_issued', payload)).toContain(' pour un client, ');
  });
});
