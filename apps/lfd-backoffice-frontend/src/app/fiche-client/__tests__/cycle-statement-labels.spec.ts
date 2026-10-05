import { describe, expect, it } from 'vitest';

import { cycleLabel, monthLabel, vatRateLabel } from '../facturation/cycle-statement-labels';

describe('les libellés du relevé', () => {
  it('écrit le mois en toutes lettres', () => {
    expect(monthLabel('2026-09')).toBe('septembre 2026');
    expect(monthLabel('2027-01')).toBe('janvier 2027');
  });

  it('marque le cycle en cours', () => {
    const cycle = { month: '2026-10', startsAt: '', closesAt: '', inProgress: true };
    expect(cycleLabel(cycle)).toBe('octobre 2026 — en cours, non clos');
    expect(cycleLabel({ ...cycle, inProgress: false })).toBe('octobre 2026');
  });

  it('écrit le taux à la française, sans zéro inventé', () => {
    expect(vatRateLabel(5.5)).toBe('TVA 5,5 %');
    expect(vatRateLabel(20)).toBe('TVA 20 %');
  });
});
