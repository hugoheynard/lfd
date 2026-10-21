import { describe, expect, it } from 'vitest';

import { autoCloseAheadLabel } from './auto-close-label';

/** Les instants sont le SUJET, comparés à un `now` fixé — jamais à l'horloge. */
describe('autoCloseAheadLabel', () => {
  const NOW = new Date('2026-10-05T18:00:00.000Z');

  it('dit l’arrêt à venir, à l’heure de Paris', () => {
    // 21:00 UTC un lundi d'octobre = 23:00 à Paris.
    expect(autoCloseAheadLabel('2026-10-05T21:00:00.000Z', NOW)).toBe(
      'Arrêt automatique lundi à 23:00',
    );
  });

  it('se tait une fois l’instant passé, et sans heure limite', () => {
    expect(autoCloseAheadLabel('2026-10-05T18:00:00.000Z', NOW)).toBeNull();
    expect(autoCloseAheadLabel(null, NOW)).toBeNull();
  });
});
