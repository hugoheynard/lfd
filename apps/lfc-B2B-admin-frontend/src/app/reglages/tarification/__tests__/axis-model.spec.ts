import { describe, expect, it } from 'vitest';

import {
  axisSpan,
  dayStart,
  instantAt,
  monthTicks,
  percentOf,
  snapToDay,
} from '../frise/axis-model';

/**
 * **La géométrie de l'axe.**
 *
 * Deux garanties : l'axe couvre toujours aujourd'hui — une frise qui s'arrêterait
 * à la dernière décision laisserait croire que le temps s'est arrêté avec elle —
 * et un instant se pose au JOUR, parce que le pointeur offre une précision que la
 * donnée n'a pas.
 */

const NOW = Date.parse('2026-08-17T12:00:00.000Z');
const band = (from: string, to: string | null) => ({ validFrom: from, validTo: to });

describe("l'étendue de l'axe", () => {
  it('couvre aujourd’hui même quand toutes les décisions sont anciennes', () => {
    const span = axisSpan([band('2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z')], NOW);

    expect(span.from).toBeLessThan(Date.parse('2026-01-01T00:00:00.000Z'));
    expect(span.to).toBeGreaterThan(NOW);
  });

  it('couvre aussi une décision à venir', () => {
    const future = Date.parse('2026-12-01T00:00:00.000Z');
    const span = axisSpan([band('2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z')], NOW);

    expect(span.to).toBeGreaterThanOrEqual(future);
    expect(span.from).toBeLessThan(NOW);
  });

  /** Sans décision, l'axe existe quand même : il ne divise jamais par zéro. */
  it('garde une durée sans aucune décision', () => {
    const span = axisSpan([], NOW);

    expect(span.to).toBeGreaterThan(span.from);
  });
});

describe('la conversion instant ↔ position', () => {
  const span = {
    from: Date.parse('2026-08-01T00:00:00.000Z'),
    to: Date.parse('2026-08-31T00:00:00.000Z'),
  };

  it('place le milieu au milieu', () => {
    expect(Math.round(percentOf(span, Date.parse('2026-08-16T00:00:00.000Z')))).toBe(50);
  });

  /** Un instant hors de l'axe se borne : une barre qui déborde se lit comme un bug. */
  it('borne un instant qui sort de la fenêtre', () => {
    expect(percentOf(span, Date.parse('2020-01-01T00:00:00.000Z'))).toBe(0);
    expect(percentOf(span, Date.parse('2030-01-01T00:00:00.000Z'))).toBe(100);
  });

  it('retrouve l’instant depuis la position', () => {
    const at = instantAt(span, 50);

    expect(snapToDay(at)).toBe('2026-08-16');
  });

  it('borne une position hors piste', () => {
    expect(instantAt(span, -20)).toBe(span.from);
    expect(instantAt(span, 200)).toBe(span.to);
  });

  /** Le pointeur donne des millisecondes ; la donnée, elle, est datée au jour. */
  it('arrondit au jour, et rend un instant ISO exploitable', () => {
    expect(snapToDay(Date.parse('2026-08-16T23:59:00.000Z'))).toBe('2026-08-16');
    expect(dayStart('2026-08-16')).toBe('2026-08-16T00:00:00.000Z');
  });
});

describe('les graduations', () => {
  it('pose un repère par mois entamé', () => {
    const ticks = monthTicks({
      from: Date.parse('2026-07-15T00:00:00.000Z'),
      to: Date.parse('2026-10-05T00:00:00.000Z'),
    });

    expect(ticks.map((tick) => tick.label)).toEqual(['août 26', 'sept. 26', 'oct. 26']);
  });
});
