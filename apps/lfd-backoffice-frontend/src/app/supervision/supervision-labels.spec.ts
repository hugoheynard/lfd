import { describe, expect, it } from 'vitest';

import { asOfLabel, clockLabel, countLabel, slotTimeLabel } from './supervision-labels';

describe('les mots de la Supervision', () => {
  it('écrit l’heure d’une ligne de file avec ses minutes, pour aligner la colonne', () => {
    expect(slotTimeLabel('07:00')).toBe('7 h 00');
    expect(slotTimeLabel('06:45')).toBe('6 h 45');
  });

  it('lit un instant à l’heure de Paris, minutes comprises', () => {
    // 05:04 UTC en septembre = 7 h 04 à Paris (heure d'été).
    expect(clockLabel('2026-09-25T05:04:00.000Z')).toBe('7 h 04');
    expect(clockLabel('pas une date')).toBeNull();
  });

  it('date la fraîcheur de la vue sans inventer d’heure', () => {
    expect(asOfLabel('2026-09-25T07:42:00.000Z')).toBe('à jour à 9 h 42');
    expect(asOfLabel('illisible')).toBe('');
  });

  it('accorde un compte', () => {
    expect(countLabel(1, 'commande', 'commandes')).toBe('1 commande');
    expect(countLabel(3, 'commande', 'commandes')).toBe('3 commandes');
  });
});
