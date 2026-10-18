import type { StaffSuggestionRuleView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { staffSuggestion } from '../staff-suggestion.testing';
import { countersWindow, periodLabel, suggestedLabel, triggerLabel } from '../suggestion-format';

const CHOICES = {
  articles: [
    { sku: 'VIE-001', name: 'Croissant', familyId: 'fam-vien' },
    { sku: 'PAI-001', name: 'Baguette', familyId: 'fam-pains' },
  ],
  families: [{ id: 'fam-vien', name: 'Viennoiseries' }],
};

describe('ce que l’écran dit d’une suggestion', () => {
  it('nomme le déclencheur et les articles, et garde la référence de ce que le catalogue ne sert plus', () => {
    const rule = staffSuggestion({ suggestedSkus: ['PAI-001', 'OLD-404'] });
    expect(triggerLabel(rule, CHOICES)).toBe('Article au panier : Croissant');
    expect(suggestedLabel(rule, CHOICES)).toBe('Baguette, OLD-404');
    expect(triggerLabel({ trigger: { kind: 'category_in_cart', ref: 'fam-vien' } }, CHOICES)).toBe(
      'Famille au panier : Viennoiseries',
    );
    expect(triggerLabel({ trigger: { kind: 'everywhere', ref: null } }, null)).toBe('Partout');
  });

  it('dit la période en jours français', () => {
    expect(periodLabel({ startsOn: '2026-10-18', endsOn: '2026-10-25' })).toBe(
      'Du 18/10/2026 au 25/10/2026',
    );
    expect(periodLabel({ startsOn: '2026-10-18', endsOn: '2026-10-18' })).toBe('Le 18/10/2026');
  });

  it('compte depuis la plus ancienne règle commencée, et rien si aucune ne l’est', () => {
    const rules: StaffSuggestionRuleView[] = [
      staffSuggestion({ startsOn: '2026-10-10' }),
      staffSuggestion({ startsOn: '2026-10-05' }),
      staffSuggestion({ startsOn: '2026-11-01' }),
    ];
    expect(countersWindow(rules, '2026-10-18')).toEqual({ from: '2026-10-05', to: '2026-10-18' });
    expect(countersWindow([staffSuggestion({ startsOn: '2026-11-01' })], '2026-10-18')).toBeNull();
  });
});
