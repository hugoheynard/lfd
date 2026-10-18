import type { StaffSuggestionRuleAlert } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { ALERT_BADGES, alertFilterOf, alertLines } from '../suggestion-alerts';

const CHOICES = {
  articles: [
    { sku: 'BOI-001', name: 'Café', familyId: 'fam-boissons' },
    { sku: 'GAL-001', name: 'Galette', familyId: 'fam-vien' },
  ],
  families: [],
};

function alert(over: Partial<StaffSuggestionRuleAlert> = {}): StaffSuggestionRuleAlert {
  return {
    ruleId: 'R',
    severity: 'partial',
    triggerWithdrawn: false,
    items: [],
    window: { from: '2026-10-18', to: '2026-10-25', capped: false },
    ...over,
  };
}

describe('les alertes d’une suggestion', () => {
  it('« Vide » en alerte, « Partielle » en avertissement', () => {
    expect(ALERT_BADGES.empty).toEqual({ label: 'Vide', variant: 'alert' });
    expect(ALERT_BADGES.partial).toEqual({ label: 'Partielle', variant: 'warning' });
  });

  it('dit chaque raison en clair, nommée par le catalogue, la référence à défaut', () => {
    const lines = alertLines(
      alert({
        items: [
          { sku: 'OLD-001', audience: null, reason: 'withdrawn' },
          { sku: 'BOI-001', audience: 'public', reason: 'not_for_audience' },
          { sku: 'BOI-001', audience: 'pro', reason: 'hidden_for_audience' },
          { sku: 'GAL-001', audience: 'pro', reason: 'never_orderable' },
          { sku: 'GAL-001', audience: 'public', reason: 'never_orderable' },
        ],
      }),
      CHOICES,
    );
    expect(lines).toEqual([
      '« OLD-001 » est retiré du catalogue.',
      '« Café » n’est plus vendu aux particuliers.',
      '« Café » est masqué pour les professionnels.',
      '« Galette » n’est commandable aucun jour d’ici le 25 octobre (aux professionnels et aux particuliers).',
    ]);
  });

  it('avoue une période plus longue que ce qui est regardé, et dit le déclencheur mort d’abord', () => {
    const lines = alertLines(
      alert({
        severity: 'empty',
        triggerWithdrawn: true,
        items: [{ sku: 'GAL-001', audience: 'public', reason: 'never_orderable' }],
        window: { from: '2026-10-18', to: '2026-11-17', capped: true },
      }),
      CHOICES,
    );
    expect(lines[0]).toContain('ne peut plus se déclencher');
    expect(lines[1]).toContain('d’ici le 17 novembre (la suite de la période n’est pas regardée)');
  });

  it('ne lit que les deux filtres', () => {
    expect(alertFilterOf('to_fix')).toBe('to_fix');
    expect(alertFilterOf('all')).toBe('all');
    expect(alertFilterOf('autre')).toBeNull();
  });
});
