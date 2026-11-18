import type { BudgetCommitmentRequirementsView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  budgetCommitmentGaps,
  budgetCommitmentLabel,
  budgetCommitmentPayloadOf,
} from '../budget-commitment';

const ARMY: BudgetCommitmentRequirementsView = {
  payerCompanyId: 'cmp_army',
  publicPayer: true,
  commitmentRequired: true,
  serviceCodeRequired: true,
  defaultServiceCode: '',
};

describe('budgetCommitmentGaps', () => {
  it('un numéro et un code exigés, absents : deux manques', () => {
    expect(budgetCommitmentGaps(ARMY, ' ', '')).toHaveLength(2);
  });

  it('un code exigé avec un défaut sur la fiche ne manque pas', () => {
    expect(budgetCommitmentGaps({ ...ARMY, defaultServiceCode: 'SRV' }, 'N1', '')).toEqual([]);
  });

  it('un payeur privé, ou des exigences pas encore lues : rien à dire', () => {
    expect(budgetCommitmentGaps({ ...ARMY, publicPayer: false }, '', '')).toEqual([]);
    expect(budgetCommitmentGaps(null, '', '')).toEqual([]);
  });
});

describe('budgetCommitmentPayloadOf', () => {
  it('un payeur public envoie les deux textes, sans espaces autour', () => {
    expect(budgetCommitmentPayloadOf(true, ' N1 ', ' SRV ')).toEqual({
      budgetCommitment: { number: 'N1', serviceCode: 'SRV' },
    });
  });

  it('un payeur privé n’envoie rien — le serveur refuserait', () => {
    expect(budgetCommitmentPayloadOf(false, 'N1', 'SRV')).toEqual({});
  });
});

describe('budgetCommitmentLabel', () => {
  it('dit ce qui est porté, ou rien', () => {
    expect(budgetCommitmentLabel({ number: 'N1', serviceCode: 'SRV' })).toBe('n° N1 · service SRV');
    expect(budgetCommitmentLabel({ number: '', serviceCode: '' })).toBeNull();
    expect(budgetCommitmentLabel(undefined)).toBeNull();
  });
});
