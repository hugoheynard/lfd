import type { PosedMercurialeView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { promotionView } from '../../../targeted-promotions/promotion.testing';
import {
  NO_PROMOTION_POLICY,
  originPhrase,
  policyOrigin,
  policyPayload,
  policyPhrase,
  policyProblem,
  promotionChoices,
  samePolicy,
} from '../promotion-policy';

const RENTREE = promotionView({ id: 'p_rentree', internalName: 'Rentrée', summary: '−10 %' });
const ETE = promotionView({
  id: 'p_ete',
  internalName: 'Été',
  summary: '−5 %',
  archived: { at: '2026-09-01T00:00:00.000Z', by: 'staff_1', reason: 'Fin' },
});

const MERCURIALE: PosedMercurialeView = {
  id: 'merc_1',
  label: 'Mercuriale 2027',
  validFrom: '2026-01-01T00:00:00.000Z',
  validTo: null,
  status: 'active',
  ruleCount: 1,
  skuCount: 1,
  createdBy: 'staff_1',
  createdByName: null,
  lines: [],
  amendments: [],
};

function amendment(id: string, validFrom: string, withPolicy: boolean) {
  return {
    id,
    validFrom,
    validTo: null,
    reason: 'Motif',
    openedSkus: [],
    endedSkus: [],
    promotionPolicy: withPolicy ? { mode: 'all' as const, promotionIds: [] } : null,
    createdBy: 'staff_1',
    createdByName: null,
  };
}

describe('la politique de promotions d’une mercuriale', () => {
  it('n’envoie la liste qu’en « Au choix »', () => {
    expect(policyPayload({ mode: 'all', promotionIds: ['p_rentree'] })).toEqual({
      mode: 'all',
      promotionIds: [],
    });
    expect(policyPayload({ mode: 'selected', promotionIds: ['p_rentree'] })).toEqual({
      mode: 'selected',
      promotionIds: ['p_rentree'],
    });
  });

  it('refuse un « Au choix » vide, rien d’autre', () => {
    expect(policyProblem({ mode: 'selected', promotionIds: [] })).toContain('au moins une');
    expect(policyProblem(NO_PROMOTION_POLICY)).toBeNull();
  });

  it('compare sans tenir compte de l’ordre ni d’une liste gardée hors « Au choix »', () => {
    expect(
      samePolicy(
        { mode: 'selected', promotionIds: ['a', 'b'] },
        { mode: 'selected', promotionIds: ['b', 'a'] },
      ),
    ).toBe(true);
    expect(samePolicy({ mode: 'none', promotionIds: ['a'] }, NO_PROMOTION_POLICY)).toBe(true);
    expect(samePolicy({ mode: 'all', promotionIds: [] }, NO_PROMOTION_POLICY)).toBe(false);
  });

  it('propose les non archivées ; une archivée déjà choisie reste, dite « archivée »', () => {
    expect(promotionChoices([RENTREE, ETE], []).map((c) => c.value)).toEqual(['p_rentree']);
    const kept = promotionChoices([RENTREE, ETE], ['p_ete']);
    expect(kept.map((c) => c.label)).toEqual(['Rentrée — −10 %', 'Été (archivée) — −5 %']);
  });

  it('se dit en une phrase, promotions nommées', () => {
    expect(policyPhrase(NO_PROMOTION_POLICY, null)).toBe('Aucune promotion');
    expect(policyPhrase({ mode: 'all', promotionIds: [] }, null)).toBe('Toutes les promotions');
    expect(
      policyPhrase({ mode: 'selected', promotionIds: ['p_rentree', 'p_ete', 'p_x'] }, [
        RENTREE,
        ETE,
      ]),
    ).toBe('Au choix : Rentrée, Été (archivée), p_x');
  });

  it('vient de la pose tant qu’aucun avenant n’en porte une en vigueur', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    const mercuriale = {
      ...MERCURIALE,
      amendments: [
        amendment('a1', '2026-02-01T00:00:00.000Z', false),
        amendment('a2', '2026-07-01T00:00:00.000Z', true),
      ],
    };
    expect(policyOrigin(mercuriale, now)).toEqual({ kind: 'pose' });
    expect(originPhrase({ kind: 'pose' })).toBe('depuis la pose');
  });

  it('vient du dernier avenant qui en porte une et a pris effet', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    const mercuriale = {
      ...MERCURIALE,
      amendments: [
        amendment('a1', '2026-03-01T00:00:00.000Z', true),
        amendment('a2', '2026-04-01T00:00:00.000Z', true),
        amendment('a3', '2026-05-01T00:00:00.000Z', false),
      ],
    };
    const origin = policyOrigin(mercuriale, now);
    expect(origin).toEqual({ kind: 'amendment', validFrom: '2026-04-01T00:00:00.000Z' });
    expect(originPhrase(origin)).toBe('depuis l’avenant du 01/04/2026');
  });
});
