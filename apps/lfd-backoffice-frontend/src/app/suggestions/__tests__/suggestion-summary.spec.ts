import { describe, expect, it } from 'vitest';

import { staffSuggestion } from '../staff-suggestion.testing';
import { emptyDraft } from '../suggestion-draft';
import { frenchPeriod, ruleSummary, stateOf, summaryOf } from '../suggestion-summary';

const CHOICES = {
  articles: [
    { sku: 'VIE-001', name: 'Croissant', familyId: 'fam-vien' },
    { sku: 'CAF-001', name: 'Café', familyId: 'fam-boissons' },
  ],
  families: [{ id: 'fam-vien', name: 'Viennoiseries' }],
};

describe('la règle dite en une phrase', () => {
  it('compose quand, quoi, où, pour qui et la période', () => {
    const rule = staffSuggestion({
      suggestedSkus: ['CAF-001', 'OLD-404'],
      audience: 'public',
      startsOn: '2026-10-20',
      endsOn: '2026-10-31',
    });
    expect(ruleSummary(rule, CHOICES)).toBe(
      'Quand Croissant est dans le panier, proposer Café, OLD-404 au panier, aux particuliers, du 20 au 31 octobre.',
    );
  });

  it('dit ce qui reste à choisir au lieu de se taire', () => {
    const draft = {
      ...emptyDraft('2026-10-20'),
      triggerKind: 'product_viewed' as const,
      placement: 'product' as const,
    };
    expect(summaryOf(draft, CHOICES)).toBe(
      'Quand on regarde la fiche de l’article à choisir, proposer (les articles à choisir) sur la fiche de l’article, aux professionnels et aux particuliers, le 20 octobre.',
    );
  });

  it('dit une période à cheval sur deux mois ou deux années', () => {
    expect(frenchPeriod('2026-10-28', '2026-11-03')).toBe('du 28 octobre au 3 novembre');
    expect(frenchPeriod('2026-12-28', '2027-01-03')).toBe('du 28 décembre 2026 au 3 janvier 2027');
  });

  it('classe une règle : programmée, active, finie, coupée, archivée', () => {
    const rule = staffSuggestion({ startsOn: '2026-10-20', endsOn: '2026-10-31' });
    expect(stateOf(rule, '2026-10-19')).toBe('scheduled');
    expect(stateOf(rule, '2026-10-31')).toBe('live');
    expect(stateOf(rule, '2026-11-01')).toBe('ended');
    expect(stateOf({ ...rule, active: false }, '2026-10-25')).toBe('cut');
    expect(stateOf({ ...rule, archivedAt: '2026-10-21T00:00:00.000Z' }, '2026-10-25')).toBe(
      'archived',
    );
  });
});
