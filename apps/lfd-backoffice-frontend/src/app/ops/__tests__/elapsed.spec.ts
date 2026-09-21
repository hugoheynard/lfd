import { describe, expect, it } from 'vitest';

import { elapsedSince } from '../elapsed';

const AT = Date.parse('2026-08-19T12:00:00.000Z');

describe('elapsedSince', () => {
  it("rend « à l'instant » sous la minute", () => {
    // Un « 0 min » se lit comme une absence de mesure, pas comme une durée.
    expect(elapsedSince('2026-08-19T12:00:00.000Z', AT + 59_000)).toBe("à l'instant");
  });

  it('passe aux minutes, puis aux heures, puis aux jours', () => {
    expect(elapsedSince('2026-08-19T12:00:00.000Z', AT + 3 * 60_000)).toBe('3 min');
    expect(elapsedSince('2026-08-19T12:00:00.000Z', AT + 6 * 3_600_000)).toBe('6 h');
    expect(elapsedSince('2026-08-19T12:00:00.000Z', AT + 50 * 3_600_000)).toBe('2 j');
  });

  it('ne rend jamais de durée négative sur une date illisible', () => {
    // Une durée négative sur un écran de diagnostic ferait douter du reste.
    expect(elapsedSince('pas une date', AT)).toBe("à l'instant");
  });
});
