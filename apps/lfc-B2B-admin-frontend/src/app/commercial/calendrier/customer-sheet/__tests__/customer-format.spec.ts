import type { CustomerSpendTrend } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { euros, membershipAge, trendLabel, trendTone } from '../customer-format';

function trend(patch: Partial<CustomerSpendTrend> = {}): CustomerSpendTrend {
  return { last30Cents: 0, previous30Cents: 0, percent: null, direction: 'flat', ...patch };
}

describe('euros', () => {
  it('convertit les centimes et arrondit à l’euro', () => {
    expect(euros(1_248_000).replace(/ | /gu, ' ')).toBe('12 480 €');
  });

  it('ne rend pas « 0,01 € » pour un centime perdu', () => {
    expect(euros(0)).toContain('0');
  });
});

describe('membershipAge', () => {
  const now = new Date('2026-08-09T12:00:00.000Z');

  it('ne descend pas sous le mois', () => {
    expect(membershipAge('2026-08-01T00:00:00.000Z', now)).toBe('ce mois-ci');
  });

  it('compte en mois, puis en années', () => {
    expect(membershipAge('2026-02-09T00:00:00.000Z', now)).toBe('6 mois');
    expect(membershipAge('2024-08-09T00:00:00.000Z', now)).toBe('2 ans');
    expect(membershipAge('2024-02-09T00:00:00.000Z', now)).toBe('2 ans et 6 mois');
  });

  it('ne compte pas un mois qui n’est pas révolu', () => {
    // Le 9 mars → le 8 avril, ce n'est pas encore un mois.
    expect(membershipAge('2026-03-09T00:00:00.000Z', new Date('2026-04-08T12:00:00.000Z'))).toBe(
      'ce mois-ci',
    );
  });
});

describe('trendLabel', () => {
  it('chiffre quand il y a de quoi comparer', () => {
    expect(trendLabel(trend({ percent: 20, direction: 'up' }))).toBe('+20 % sur 30 jours');
    expect(trendLabel(trend({ percent: -15, direction: 'down' }))).toBe('-15 % sur 30 jours');
  });

  it('DÉCRIT au lieu d’inventer un pourcentage quand on partait de zéro', () => {
    expect(trendLabel(trend({ last30Cents: 5_000, direction: 'up' }))).toBe('premier chiffre');
    expect(trendLabel(trend())).toBe('aucune commande');
  });
});

describe('trendTone', () => {
  it('lit une hausse comme une bonne nouvelle, une baisse comme une alerte', () => {
    expect(trendTone(trend({ direction: 'up' }))).toBe('success');
    expect(trendTone(trend({ direction: 'down' }))).toBe('alert');
    expect(trendTone(trend())).toBe('neutral');
  });
});
