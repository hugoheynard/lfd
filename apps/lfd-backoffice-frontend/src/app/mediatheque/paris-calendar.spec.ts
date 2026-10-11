import { describe, expect, it } from 'vitest';

import {
  civilDayLabel,
  civilMonthLabel,
  parisDay,
  parisDayLabel,
  parisDayOf,
  parisMomentLabel,
} from './paris-calendar';

// Les dates ne sont comparées qu'au FUSEAU, jamais à l'horloge.
describe('le calendrier de Paris', () => {
  it('ramène un instant au jour de Paris, pas au jour UTC', () => {
    // 22 h 30 UTC en été : déjà le lendemain à Paris.
    expect(parisDay(new Date('2026-08-09T22:30:00.000Z'))).toBe('2026-08-10');
    expect(parisDayOf('2026-10-04T22:00:00.000Z')).toBe('2026-10-05');
    expect(parisDayOf('2026-01-15T10:00:00.000Z')).toBe('2026-01-15');
  });

  it('dit un instant en toutes lettres, à l’heure de Paris', () => {
    expect(parisDayLabel('2026-10-04T22:00:00.000Z')).toBe('5 octobre 2026');
    expect(parisMomentLabel('2026-10-04T22:05:00.000Z')).toContain('5 octobre 2026');
    expect(parisMomentLabel('2026-10-04T22:05:00.000Z')).toContain('00:05');
  });

  it('lit un jour civil sans fuseau : le 1er mars reste le 1er mars', () => {
    expect(civilDayLabel('2026-03-01')).toBe('1 mars 2026');
    expect(civilMonthLabel('2026-03-01')).toBe('mars 2026');
  });

  it('refuse un jour civil mal formé plutôt que d’inventer une date', () => {
    expect(civilDayLabel('2026-3-1')).toBeNull();
    expect(civilMonthLabel('')).toBeNull();
  });
});
