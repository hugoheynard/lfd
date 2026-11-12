import { describe, expect, it } from 'vitest';

import { bytesLabel, chartLineOf } from '../cache-chart';

const FROM = Date.parse('2026-01-01T00:00:00.000Z');
const TO = Date.parse('2026-01-01T10:00:00.000Z');
const BOX = { width: 100, height: 50 };

describe('chartLineOf', () => {
  it('ne trace rien sans aucune mesure', () => {
    expect(
      chartLineOf([{ at: '2026-01-01T01:00:00.000Z', value: null }], { from: FROM, to: TO }, BOX),
    ).toBeNull();
  });

  it("pose l'abscisse selon le temps, pas selon le rang", () => {
    const line = chartLineOf(
      [
        { at: '2026-01-01T00:00:00.000Z', value: 0 },
        { at: '2026-01-01T09:00:00.000Z', value: 10 },
      ],
      { from: FROM, to: TO },
      BOX,
    );
    expect(line).toEqual({ path: 'M 0 50 L 90 0', peak: 10 });
  });

  it('coupe le trait sur une heure sans lecture', () => {
    const line = chartLineOf(
      [
        { at: '2026-01-01T00:00:00.000Z', value: 1 },
        { at: '2026-01-01T01:00:00.000Z', value: null },
        { at: '2026-01-01T02:00:00.000Z', value: 0.5 },
      ],
      { from: FROM, to: TO },
      BOX,
      1,
    );
    expect(line?.path).toBe('M 0 0 M 20 25');
  });
});

describe('bytesLabel', () => {
  it('dit les octets en unités lisibles', () => {
    expect(bytesLabel(null)).toBe('—');
    expect(bytesLabel(512)).toBe('512 o');
    expect(bytesLabel(1536)).toBe('1,5 ko');
  });
});
