import { describe, expect, it } from 'vitest';

import { draftBadgeLabel } from './draft-badge-label';

// Les dates ne sont comparées qu'entre elles : `now` est un paramètre, pas l'horloge.
const NOW = new Date('2026-11-03T16:00:00.000Z');

describe('draftBadgeLabel', () => {
  it('dit l’heure de Paris quand le brouillon est du jour', () => {
    expect(draftBadgeLabel('2026-11-03T13:32:00.000Z', NOW)).toBe('Brouillon · 14 h 32');
  });

  it('dit le jour quand le brouillon est d’un autre jour', () => {
    expect(draftBadgeLabel('2026-11-02T09:00:00.000Z', NOW)).toBe('Brouillon · 2 nov.');
  });

  it('tranche le jour à Paris, pas en UTC', () => {
    // 23 h 30 UTC le 2 novembre = 0 h 30 le 3 à Paris : c'est aujourd'hui.
    expect(draftBadgeLabel('2026-11-02T23:30:00.000Z', NOW)).toBe('Brouillon · 0 h 30');
  });
});
