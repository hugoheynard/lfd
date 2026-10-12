import { describe, expect, it } from 'vitest';

import {
  defaultDays,
  rhythmDraftProblem,
  rhythmSentence,
  sameRhythm,
  shortPeriodWarning,
} from '../billing-rhythm-wording';

/** Les instants ne sont comparés qu'entre eux : aucune lecture du mur. */
describe('les mots du rythme de facturation', () => {
  it('dit les trois rythmes', () => {
    expect(rhythmSentence({ kind: 'monthly', days: [1] })).toBe('Chaque mois, clôture le 1er');
    expect(rhythmSentence({ kind: 'semimonthly', days: [1, 16] })).toBe(
      'Deux fois par mois, clôtures le 1er et le 16',
    );
    expect(rhythmSentence({ kind: 'weekly', days: [1] })).toBe('Chaque semaine, clôture le lundi');
  });

  it('propose 1er, 1er et 16, lundi', () => {
    expect(defaultDays('monthly')).toEqual([1]);
    expect(defaultDays('semimonthly')).toEqual([1, 16]);
    expect(defaultDays('weekly')).toEqual([1]);
  });

  it('refuse la forme : vide, au-delà du 28, deux jours égaux', () => {
    expect(rhythmDraftProblem('monthly', [null])).toContain('Renseignez');
    expect(rhythmDraftProblem('monthly', [29])).toContain('du 1er au 28');
    expect(rhythmDraftProblem('semimonthly', [5, 5])).toContain('différents');
    expect(rhythmDraftProblem('semimonthly', [1, 16])).toBeNull();
    expect(rhythmDraftProblem('weekly', [7])).toBeNull();
  });

  it('compare deux rythmes jour par jour', () => {
    expect(sameRhythm({ kind: 'monthly', days: [1] }, { kind: 'monthly', days: [1] })).toBe(true);
    expect(sameRhythm({ kind: 'monthly', days: [1] }, { kind: 'weekly', days: [1] })).toBe(false);
  });

  it('signale une première période très courte, pas une période normale', () => {
    const effectiveAt = '2026-10-31T23:00:00.000Z';
    const short = [
      { closesAt: effectiveAt, periodLabel: 'du 1er au 31 octobre 2026', invoicedOn: '2026-10-31' },
      {
        closesAt: '2026-11-01T23:00:00.000Z',
        periodLabel: 'du 1er au 1er novembre 2026',
        invoicedOn: '2026-11-01',
      },
    ];
    const normal = [
      {
        closesAt: '2026-11-15T23:00:00.000Z',
        periodLabel: 'du 1er au 15 novembre 2026',
        invoicedOn: '2026-11-15',
      },
    ];

    expect(shortPeriodWarning(effectiveAt, short)).toContain('qu’un seul jour');
    expect(shortPeriodWarning(effectiveAt, normal)).toBeNull();
  });
});
