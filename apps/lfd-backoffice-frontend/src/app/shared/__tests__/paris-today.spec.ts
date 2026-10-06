import { describe, expect, it } from 'vitest';

import { parisToday } from '../paris-today';

describe('parisToday', () => {
  it('rend le jour de PARIS, pas celui d’UTC', () => {
    // 22 h 30 UTC un soir d'été = 00 h 30 le lendemain à Paris.
    expect(parisToday(new Date('2026-08-09T22:30:00.000Z'))).toBe('2026-08-10');
  });

  it('rend le jour au format AAAA-MM-JJ, comparable au contrat', () => {
    expect(parisToday(new Date('2026-01-15T10:00:00.000Z'))).toBe('2026-01-15');
  });
});
