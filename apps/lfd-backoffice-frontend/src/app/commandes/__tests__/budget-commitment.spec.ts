import type { BudgetCommitmentRequirementsView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  budgetCommitmentGaps,
  budgetCommitmentLabel,
  budgetCommitmentPayloadOf,
  commitmentOnQuote,
  commitmentStandingLine,
  commitmentStandingOf,
  proposedCommitmentNumber,
} from '../budget-commitment';
import { DraftStore } from '../nouvelle-commande/draft.store';

const ARMY: BudgetCommitmentRequirementsView = {
  payerCompanyId: 'cmp_army',
  publicPayer: true,
  commitmentRequired: true,
  serviceCodeRequired: true,
  defaultServiceCode: '',
  timing: 'at_order',
  currentCommitment: null,
};

describe('budgetCommitmentGaps', () => {
  it('un numéro et un code exigés, absents : deux manques', () => {
    expect(budgetCommitmentGaps(ARMY, ' ', '')).toHaveLength(2);
  });

  it('un code exigé avec un défaut sur la fiche ne manque pas', () => {
    expect(budgetCommitmentGaps({ ...ARMY, defaultServiceCode: 'SRV' }, 'N1', '')).toEqual([]);
  });

  it('sur devis de période : le numéro ne manque pas, le code garde sa règle', () => {
    const onQuote = { ...ARMY, timing: 'on_period_quote' as const };
    expect(commitmentOnQuote(onQuote)).toBe(true);
    expect(commitmentOnQuote(ARMY)).toBe(false);
    expect(budgetCommitmentGaps(onQuote, '', '')).toEqual([
      'Ce payeur exige un code service Chorus Pro.',
    ]);
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

describe('l’engagement en cours', () => {
  const CURRENT = { number: 'ENG-2026', endsOn: '2026-12-31' };

  it('court jusqu’à sa date de fin incluse, et se propose', () => {
    const standing = commitmentStandingOf(CURRENT, '2026-12-31');
    expect(standing).toEqual({ state: 'running', ...CURRENT });
    expect(proposedCommitmentNumber(standing)).toBe('ENG-2026');
    expect(standing && commitmentStandingLine(standing)).toBe(
      'Engagement n° ENG-2026 en cours jusqu’au 31/12/2026.',
    );
  });

  it('au-delà, a pris fin et ne se propose plus', () => {
    const standing = commitmentStandingOf(CURRENT, '2027-01-04');
    expect(standing?.state).toBe('ended');
    expect(proposedCommitmentNumber(standing)).toBe('');
    expect(standing && commitmentStandingLine(standing)).toBe(
      'L’engagement n° ENG-2026 a pris fin le 31/12/2026.',
    );
  });

  it('sans engagement ni journée : rien', () => {
    expect(commitmentStandingOf(null, '2026-12-01')).toBeNull();
    expect(commitmentStandingOf(CURRENT, '')).toBeNull();
    expect(proposedCommitmentNumber(null)).toBe('');
  });

  it('une saisie, même effacée, n’est jamais remplacée par la proposition', () => {
    const draft = new DraftStore();
    expect(draft.commitmentNumberFor('ENG-2026')).toBe('ENG-2026');

    draft.typeCommitmentNumber('AUTRE');
    expect(draft.commitmentNumberFor('ENG-2026')).toBe('AUTRE');
    draft.typeCommitmentNumber('');
    expect(draft.commitmentNumberFor('ENG-2026')).toBe('');

    draft.reset();
    expect(draft.commitmentNumberFor('ENG-2026')).toBe('ENG-2026');
  });
});
